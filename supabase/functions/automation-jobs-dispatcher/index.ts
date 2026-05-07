import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AutomationJob {
  id: string;
  brand_id: string;
  source_event_id: string | null;
  contact_id: string | null;
  job_type: string;
  run_at: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
}

// Backoff schedule in minutes: 5m, 15m, 60m
const BACKOFF_MINUTES = [5, 15, 60];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require cron secret or verified JWT
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const authHeader = req.headers.get("authorization") || "";
  
  const hasValidCronSecret = !!(expectedSecret && cronSecret &&
    timingSafeEqualAny(cronSecret, expectedSecret, cronSecretPrev));
  
  // SECURITY: only x-cron-secret or service_role JWT verified server-side.
  let hasValidJwt = false;
  if (!hasValidCronSecret && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    try {
      const verifyClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims) {
        const role = claimsData.claims.role as string;
        if (role === "service_role") {
          hasValidJwt = true;
        }
      }
    } catch { /* invalid JWT, fall through */ }
  }
  
  if (!hasValidCronSecret && !hasValidJwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("[automation-jobs-dispatcher] Starting dispatch cycle");

  // Atomic claim via RPC (FOR UPDATE SKIP LOCKED)
  const { data: jobs, error: fetchError } = await supabaseAdmin
    .rpc("claim_automation_jobs", { p_limit: 50 });

  if (fetchError) {
    console.error("[automation-jobs-dispatcher] Fetch error:", fetchError);
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!jobs || jobs.length === 0) {
    console.log("[automation-jobs-dispatcher] No jobs to dispatch");
    return new Response(JSON.stringify({ dispatched: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[automation-jobs-dispatcher] Claimed ${jobs.length} jobs`);

  const results: { id: string; status: string; error?: string }[] = [];
  const successIds: string[] = [];

  // Process jobs with parallelism limit of 10
  // Jobs are already marked as 'running' by claim_automation_jobs RPC
  const PARALLELISM = 10;
  for (let i = 0; i < jobs.length; i += PARALLELISM) {
    const batch = jobs.slice(i, i + PARALLELISM);

    // Bug #1 (CRITICA): Promise.allSettled invece di Promise.all per non terminare
    // l'intera batch al primo errore. Bug #10: clearTimeout sempre via try/finally.
    await Promise.allSettled(batch.map(async (job: AutomationJob) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
      try {
        const response = await fetch(job.endpoint, {
          method: job.method,
          headers: {
            "Content-Type": "application/json",
            ...job.headers,
          },
          body: JSON.stringify(job.payload),
          signal: controller.signal,
        });

        if (response.ok) {
          // Success - accumulate id for a single batched UPDATE at the end (Bug #3, N+1).
          successIds.push(job.id);
          results.push({ id: job.id, status: "sent" });
        } else {
          // HTTP error - schedule retry or mark as failed
          const errorText = await response.text().catch(() => "Unknown error");
          await handleJobFailure(supabaseAdmin, job, `HTTP ${response.status}: ${errorText}`);
          results.push({ id: job.id, status: "failed", error: errorText });
        }
      } catch (error) {
        // Network/timeout error
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await handleJobFailure(supabaseAdmin, job, errorMessage);
        results.push({ id: job.id, status: "failed", error: errorMessage });
      } finally {
        clearTimeout(timeout);
      }
    }));
  }

  // Bug #3 (CRITICA): batch UPDATE per tutti i success, evita N+1.
  if (successIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: batchUpdErr } = await supabaseAdmin
      .from("automation_jobs")
      .update({ status: "sent", sent_at: nowIso, updated_at: nowIso })
      .in("id", successIds);
    if (batchUpdErr) {
      console.error("[automation-jobs-dispatcher] Batch success UPDATE failed:", batchUpdErr);
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  const failed = results.filter(r => r.status === "failed").length;

  console.log(`[automation-jobs-dispatcher] Cycle complete: ${sent} sent, ${failed} failed`);

  return new Response(
    JSON.stringify({ dispatched: jobs.length, sent, failed, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

async function handleJobFailure(
  supabase: ReturnType<typeof createClient>,
  job: AutomationJob,
  errorMessage: string
) {
  const newAttempts = job.attempts + 1;

  if (newAttempts >= job.max_attempts) {
    // Max attempts reached - mark as failed permanently
    await supabase
      .from("automation_jobs")
      .update({
        status: "failed",
        attempts: newAttempts,
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.error(`[automation-jobs-dispatcher] Job ${job.id} failed permanently after ${newAttempts} attempts: ${errorMessage}`);
  } else {
    // Schedule retry with backoff
    const backoffIndex = Math.min(newAttempts - 1, BACKOFF_MINUTES.length - 1);
    const backoffMinutes = BACKOFF_MINUTES[backoffIndex];
    const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await supabase
      .from("automation_jobs")
      .update({
        status: "scheduled",
        attempts: newAttempts,
        last_error: errorMessage,
        run_at: nextRunAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`[automation-jobs-dispatcher] Job ${job.id} scheduled for retry at ${nextRunAt.toISOString()}`);
  }
}
