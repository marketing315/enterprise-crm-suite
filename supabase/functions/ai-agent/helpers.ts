// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = any;

export type AgentHistoryMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

export function isAllBrandsMode(brandId: string): boolean {
  return brandId === SYSTEM_BRAND_ID;
}

/** Apply brand filter: skip filter for all-brands mode, otherwise eq brand_id */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyBrandFilter(query: any, brandId: string): any {
  if (isAllBrandsMode(brandId)) return query;
  return query.eq("brand_id", brandId);
}

export function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (period) {
    case "today": { const s = new Date(now); s.setHours(0, 0, 0, 0); return { from: s.toISOString(), to }; }
    case "week": case "7d": { const s = new Date(now); s.setDate(s.getDate() - 7); return { from: s.toISOString(), to }; }
    case "month": case "30d": { const s = new Date(now); s.setDate(s.getDate() - 30); return { from: s.toISOString(), to }; }
    default: { const s = new Date(now); s.setDate(s.getDate() - 7); return { from: s.toISOString(), to }; }
  }
}

/** Strip thinking/reasoning blocks that some models leak into output */
export function cleanThinkingContent(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/gi, '');
  cleaned = cleaned.replace(/^(?:\((?:Done|Thinking|Note|Stopping|Ready|Over|Goodbye|Proceeding|Checked|Excellent|Let's|I (?:will|should|need|am)|No (?:more|markdown)|Wait|Steps|Matches|All (?:good|correct)|Everything|Just|End|Sigh|Writing|Yes|Okay|Go|Silence|Really|Please|Self-Correction|Line break|Emoji|Final)[^)]*\)\s*)+$/gm, '');
  cleaned = cleaned.replace(/(?:\s*\(done\)\s*){2,}/gi, '');
  cleaned = cleaned.replace(/^.*(?:include\s+consigli|non\s+rivelare\s+la\s+logica|formatta\s+con\s+markdown|usa\s+numeri\s+concreti\s+e\s+percentuali|concludi\s+con\s+\d+.*suggeriment|scrivi\s+solo\s+il\s+contenuto\s+finale|non\s+includere\s+mai\s+ragionamenti|regole\s+di\s+risposta|Usa una formattazione markdown|Termina con \d+|Non citare MAI le regole|NON aggiungere altre frasi|Non giustificare mai perch).*$/gmi, '');
  cleaned = cleaned.replace(/^(?:I should|Let me|I will|I need to|I'll|I must|I am going to|My plan is|Here is my|Now I will|Next I will|Wait,|Oh wait|How am I|Let's (?:think|see|check|do|try|review|refine|draft|go|begin|write|use|execute|fire|test)|Yes!|NO!|Okay[.,!]|This (?:perfectly|is|means|looks)|Start\.|End\.|Looks good|Done\.|Bye\.).*$/gmi, '');
  cleaned = cleaned.replace(/^.*(?:dynamic_analytics_query|get_raw_table_data|search_contacts|get_pipeline_status|get_ad_performance|get_contact_timeline|get_operator_performance)\s*(?:is|might|but|→|->|takes|returns|doesn't|failed|with|for).*$/gmi, '');
  cleaned = cleaned.replace(/^(?:Vediamo quali tabelle|Wait, lead_events|Oh wait, dynamic|Since I MUST|Let's review the|Can I fetch|Too late|Since the first error).*$/gmi, '');

  const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 5) {
    const reasoningPatterns = /^(?:\(.*\)$|I (?:should|will|need|am|have|don't|can|cannot|must)|Wait|Let me|Let's|How (?:am|do|can|should)|Yes|No[,!]|Okay|Since|But |If |This |That |The |My |We |Oh |Hmm|What if|Actually|Really|Maybe|Perhaps|However|Although|Looks|Done|End|Start|Go|Bye|Silence|Writing|Proceed|Check|Correct|Good|Final|Perfect)/i;
    const reasoningLineCount = lines.filter(l => reasoningPatterns.test(l.trim())).length;
    const reasoningRatio = reasoningLineCount / lines.length;
    if (reasoningRatio > 0.5) {
      console.warn(`[ai-agent] Detected bulk CoT leak: ${reasoningLineCount}/${lines.length} lines (${Math.round(reasoningRatio * 100)}%). Stripping entire response.`);
      return '';
    }
  }

  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n').trim();
  return cleaned;
}

/** Extract content from AI response, preferring content over reasoning_content */
export function extractAIContent(message: Record<string, unknown>): string {
  return (message?.content as string) || '';
}

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_TOTAL_CHARS = 12000;
const MAX_CONTEXT_MESSAGE_CHARS = 1200;
const THREAD_HISTORY_FETCH_LIMIT = 30;

export function compactHistory(messages: AgentHistoryMessage[]): AgentHistoryMessage[] {
  const selected: AgentHistoryMessage[] = [];
  let totalChars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg.content) continue;
    if (selected.length >= MAX_CONTEXT_MESSAGES) break;
    if (totalChars + msg.content.length > MAX_CONTEXT_TOTAL_CHARS && selected.length > 0) break;

    selected.push({
      role: msg.role,
      content: msg.content.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
    });
    totalChars += Math.min(msg.content.length, MAX_CONTEXT_MESSAGE_CHARS);
  }

  return selected.reverse();
}

export function sanitizeRequestedHistory(history: unknown): AgentHistoryMessage[] {
  if (!Array.isArray(history)) return [];

  const normalized = history
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: string }).role;
      const content = (item as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      const clean = content.trim();
      if (!clean) return null;
      return { role, content: clean } as AgentHistoryMessage;
    })
    .filter((m): m is AgentHistoryMessage => m !== null);

  return compactHistory(normalized);
}

export async function getThreadHistory(
  supabase: SupabaseClient,
  threadId: string
): Promise<AgentHistoryMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("sender_type, message_text, created_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(THREAD_HISTORY_FETCH_LIMIT);

  if (error) {
    console.warn("[ai-agent] Failed to load thread history:", error.message);
    return [];
  }

  const normalized = (data || [])
    .reverse()
    .map((row: { sender_type: string; message_text: string }) => {
      if (row.sender_type !== "user" && row.sender_type !== "ai") return null;
      const clean = (row.message_text || "").trim();
      if (!clean) return null;
      return { role: row.sender_type === "ai" ? "assistant" : "user", content: clean } as AgentHistoryMessage;
    })
    .filter((m): m is AgentHistoryMessage => m !== null);

  return compactHistory(normalized);
}

export async function resolveConversationHistory(
  supabase: SupabaseClient,
  threadId: string | undefined,
  requestedHistory: unknown
): Promise<AgentHistoryMessage[]> {
  if (!threadId) return sanitizeRequestedHistory(requestedHistory);
  const dbHistory = await getThreadHistory(supabase, threadId);
  if (dbHistory.length > 0) return dbHistory;
  return sanitizeRequestedHistory(requestedHistory);
}

/** Fetch with timeout + retry */
export async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 25000, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (attempt < retries && isAbort) { console.log(`[ai-agent] Attempt ${attempt + 1} timed out, retrying...`); continue; }
      if (isAbort) throw new Error("La richiesta AI è scaduta. Riprova con una domanda più semplice.");
      throw err;
    }
  }
  throw new Error("Unexpected: all retries exhausted");
}
