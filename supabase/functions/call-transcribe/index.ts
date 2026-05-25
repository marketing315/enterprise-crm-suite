// F3: Call transcription + sentiment analysis worker
//
// Modes:
//   POST { transcript_id }   → process a single queued transcript
//   POST { call_log_id }     → enqueue (if needed) and process one call
//   POST { sweep: true }     → process up to `limit` pending rows (cron)
//
// Pipeline:
//   1) Download recording (HEAD+GET; SSRF-safe via fetch + content-type check)
//   2) Whisper STT (OpenAI API) via Lovable AI Gateway transcription endpoint
//   3) Gemini analysis (sentiment + outcome + intent + summary) via tool-call
//   4) Write back full_text/summary/sentiment/* on call_transcripts
//
// Idempotent: rows are claimed via UPDATE ... WHERE stt_status='pending'.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper hard limit
const SWEEP_LIMIT_DEFAULT = 5;

type SentimentLabel = "very_negative" | "negative" | "neutral" | "positive" | "very_positive" | "undetermined";
type SpeakerTurn = { speaker: "customer" | "operator"; text: string; sentiment?: SentimentLabel };

type AnalysisResult = {
  summary: string;
  sentiment: SentimentLabel;
  sentiment_score: number;
  sentiment_customer: SentimentLabel;
  sentiment_customer_score: number;
  sentiment_operator: SentimentLabel;
  sentiment_operator_score: number;
  speaker_turns: SpeakerTurn[];
  call_outcome: string;
  client_intent: string;
  decision_status: string;
  objection_type: string;
  clinical_interest: string;
  call_quality: string;
  notes: string;
  keywords: string[];
  channel: "call" | "chat";
  confidence: number;
};

const SENTIMENT_ENUM = ["very_negative", "negative", "neutral", "positive", "very_positive", "undetermined"];

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "analyze_call",
    description: "Classifica una trascrizione di chiamata, attribuendo ogni turno a cliente o operatore.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Riassunto breve (max 400 caratteri)" },
        sentiment: { type: "string", enum: SENTIMENT_ENUM, description: "Sentiment complessivo" },
        sentiment_score: { type: "number", description: "-1 (molto negativo) … +1 (molto positivo)" },
        sentiment_customer: { type: "string", enum: SENTIMENT_ENUM, description: "Sentiment del cliente" },
        sentiment_customer_score: { type: "number", description: "-1..+1 cliente" },
        sentiment_operator: { type: "string", enum: SENTIMENT_ENUM, description: "Sentiment dell'operatore" },
        sentiment_operator_score: { type: "number", description: "-1..+1 operatore" },
        speaker_turns: {
          type: "array",
          description: "Sequenza ordinata di turni; etichetta speaker per ciascuno.",
          items: {
            type: "object",
            properties: {
              speaker: { type: "string", enum: ["customer", "operator"] },
              text: { type: "string" },
              sentiment: { type: "string", enum: SENTIMENT_ENUM },
            },
            required: ["speaker", "text"],
            additionalProperties: false,
          },
        },
        call_outcome: {
          type: "string",
          enum: ["confirmed", "to_callback", "appointment_cancelled", "appointment_rescheduled", "rejection", "interrupted"],
        },
        client_intent: {
          type: "string",
          enum: ["price_request", "info_request", "callback_missed", "free_trial", "other_unclear"],
        },
        decision_status: {
          type: "string",
          enum: ["ready_to_book", "postpones", "not_interested", "interested_undecided"],
        },
        objection_type: {
          type: "string",
          enum: ["none", "price", "external_consult", "distrust", "time", "home"],
        },
        clinical_interest: {
          type: "string",
          enum: ["inflammation_generic", "preventive_curiosity", "muscle_pain", "joint_pain", "back_neck_pain", "none"],
        },
        call_quality: { type: "string", enum: ["fluent", "complex", "interrupted"] },
        notes: { type: "string", description: "Note operative max 240 caratteri" },
        keywords: { type: "array", items: { type: "string" }, description: "3-8 parole chiave" },
        channel: { type: "string", enum: ["call", "chat"] },
        confidence: { type: "number", description: "0..1" },
      },
      required: [
        "summary", "sentiment", "sentiment_score",
        "sentiment_customer", "sentiment_customer_score",
        "sentiment_operator", "sentiment_operator_score",
        "speaker_turns",
        "call_outcome", "client_intent",
        "decision_status", "objection_type", "clinical_interest", "call_quality",
        "notes", "keywords", "channel", "confidence",
      ],
      additionalProperties: false,
    },
  },
};


async function downloadAudio(url: string): Promise<{ blob: Blob; filename: string }> {
  if (!/^https:\/\//i.test(url)) throw new Error("recording_url must be https");
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`audio download failed: ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > MAX_AUDIO_BYTES) throw new Error(`audio too large: ${len} bytes`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_AUDIO_BYTES) throw new Error(`audio too large: ${buf.byteLength} bytes`);
  const ct = res.headers.get("content-type") ?? "audio/mpeg";
  const ext = ct.includes("wav") ? "wav" : ct.includes("ogg") ? "ogg" : ct.includes("mp4") ? "m4a" : "mp3";
  return { blob: new Blob([buf], { type: ct }), filename: `audio.${ext}` };
}

async function whisperTranscribe(blob: Blob, filename: string): Promise<{ text: string; durationSec?: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY non configurata — richiesta per Whisper STT");
  }
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-1");
  form.append("language", "it");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Whisper error ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  return { text: String(json.text ?? "").trim(), durationSec: json.duration ? Math.round(json.duration) : undefined };
}

async function analyzeWithGemini(transcript: string, callType?: string | null): Promise<AnalysisResult> {
  const direction =
    callType === "inbound"
      ? "La chiamata è INBOUND: il primo a parlare è quasi sempre l'operatore (saluto aziendale), poi il cliente."
      : callType === "outbound"
        ? "La chiamata è OUTBOUND: il primo a parlare è quasi sempre il cliente (pronto?), poi l'operatore si presenta."
        : "Direzione della chiamata sconosciuta: usa i contenuti per dedurre chi è cliente e chi operatore.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Sei un analista di chiamate commerciali nel settore medicale. " +
            "Ricostruisci i turni di parola assegnando ogni frase a 'customer' o 'operator' (diarizzazione semantica) " +
            "e calcola sentiment separato per ciascuno. " +
            direction + " " +
            "Sii conservativo: se i segnali sono ambigui usa 'undetermined'/'none'/'interrupted'. Rispondi sempre invocando lo strumento.",
        },
        { role: "user", content: `Analizza questa trascrizione:\n\n${transcript.slice(0, 12000)}` },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "analyze_call" } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("payment_required");
    throw new Error(`gemini error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc?.function?.arguments) throw new Error("analysis: missing tool_call");
  const parsed = JSON.parse(tc.function.arguments) as AnalysisResult;
  return parsed;
}


async function processOne(supabase: ReturnType<typeof createClient>, transcriptId: string): Promise<void> {
  // Claim row (pending → processing)
  const { data: claimed, error: claimErr } = await supabase
    .from("call_transcripts")
    .update({ stt_status: "processing", ai_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", transcriptId)
    .eq("stt_status", "pending")
    .select("id, recording_url, full_text, call_log_id")
    .maybeSingle();

  if (claimErr) throw claimErr;
  if (!claimed) {
    console.log(`[call-transcribe] ${transcriptId} not pending, skipping`);
    return;
  }

  // Lookup call direction for diarization hint
  let callType: string | null = null;
  if (claimed.call_log_id) {
    const { data: cl } = await supabase
      .from("call_logs")
      .select("call_type")
      .eq("id", claimed.call_log_id as string)
      .maybeSingle();
    callType = (cl?.call_type as string | null) ?? null;
  }

  const t0 = Date.now();
  try {
    // STT
    let text = claimed.full_text as string | null;
    let durationSec: number | undefined;
    if (!text) {
      const { blob, filename } = await downloadAudio(claimed.recording_url as string);
      const w = await whisperTranscribe(blob, filename);
      text = w.text;
      durationSec = w.durationSec;
      if (!text || text.length < 5) {
        await supabase.from("call_transcripts").update({
          stt_status: "failed",
          ai_status: "failed",
          stt_error: "transcript vuoto",
          updated_at: new Date().toISOString(),
        }).eq("id", transcriptId);
        return;
      }
    }

    await supabase.from("call_transcripts").update({
      full_text: text,
      stt_status: "completed",
      stt_provider: "openai/whisper-1",
      stt_duration_seconds: durationSec ?? null,
      latency_ms: Date.now() - t0,
      updated_at: new Date().toISOString(),
    }).eq("id", transcriptId);

    // Analysis (with diarization)
    const analysis = await analyzeWithGemini(text, callType);
    const diarizationOk = Array.isArray(analysis.speaker_turns) && analysis.speaker_turns.length > 0;
    await supabase.from("call_transcripts").update({
      ai_status: "completed",
      ai_model: "google/gemini-3-flash-preview",
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      sentiment_score: analysis.sentiment_score,
      sentiment_customer: analysis.sentiment_customer ?? null,
      sentiment_customer_score: analysis.sentiment_customer_score ?? null,
      sentiment_operator: analysis.sentiment_operator ?? null,
      sentiment_operator_score: analysis.sentiment_operator_score ?? null,
      speaker_turns: diarizationOk ? analysis.speaker_turns : null,
      diarization_status: diarizationOk ? "completed" : "failed",
      call_outcome: analysis.call_outcome,
      client_intent: analysis.client_intent,
      decision_status: analysis.decision_status,
      objection_type: analysis.objection_type,
      clinical_interest: analysis.clinical_interest,
      call_quality: analysis.call_quality,
      notes: analysis.notes,
      keywords: analysis.keywords,
      channel: analysis.channel,
      confidence: analysis.confidence,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", transcriptId);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[call-transcribe] ${transcriptId} failed:`, msg);
    await supabase.from("call_transcripts").update({
      stt_status: "failed",
      ai_status: "failed",
      stt_error: msg,
      ai_error: msg,
      updated_at: new Date().toISOString(),
    }).eq("id", transcriptId);
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));

    let { transcript_id, call_log_id, sweep, limit } = body as {
      transcript_id?: string;
      call_log_id?: string;
      sweep?: boolean;
      limit?: number;
    };

    // Enqueue from call_log if needed
    if (call_log_id && !transcript_id) {
      const { data, error } = await supabase.rpc("enqueue_call_transcript", { p_call_log_id: call_log_id });
      if (error) throw error;
      transcript_id = data as string | null ?? undefined;
      if (!transcript_id) {
        return new Response(JSON.stringify({ skipped: true, reason: "no recording or contact" }), { headers: cors });
      }
    }

    if (transcript_id) {
      await processOne(supabase, transcript_id);
      return new Response(JSON.stringify({ ok: true, transcript_id }), { headers: cors });
    }

    if (sweep) {
      const max = Math.min(Math.max(limit ?? SWEEP_LIMIT_DEFAULT, 1), 20);
      // Also pick up brand-new completed calls that haven't been enqueued yet
      const { data: newCalls } = await supabase
        .from("call_logs")
        .select("id")
        .not("recording_url", "is", null)
        .not("contact_id", "is", null)
        .gte("ended_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(50);
      if (newCalls?.length) {
        for (const c of newCalls) {
          await supabase.rpc("enqueue_call_transcript", { p_call_log_id: c.id });
        }
      }

      const { data: pending } = await supabase
        .from("call_transcripts")
        .select("id")
        .eq("stt_status", "pending")
        .order("created_at", { ascending: true })
        .limit(max);

      const ids = (pending ?? []).map((p) => p.id as string);
      for (const id of ids) {
        await processOne(supabase, id);
      }
      return new Response(JSON.stringify({ ok: true, processed: ids.length }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "missing transcript_id, call_log_id or sweep" }), {
      status: 400, headers: cors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[call-transcribe] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
});
