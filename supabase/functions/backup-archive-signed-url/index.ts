// Genera signed URL temporaneo per scaricare un archivio backup dallo Storage privato.
// Solo admin/CEO autenticati possono richiederlo. Verifica autorizzazione via RPC
// che convalida brand_id del backup vs ruoli dell'utente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let payload: { run_id?: string };
    try { payload = await req.json(); }
    catch {
      return new Response(JSON.stringify({ error: "invalid_json" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const runId = payload.run_id;
    if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) {
      return new Response(JSON.stringify({ error: "invalid_run_id" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Carica run
    const { data: run, error: runErr } = await admin
      .from("backup_runs")
      .select("id, brand_id, storage_path, status")
      .eq("id", runId)
      .maybeSingle();
    if (runErr || !run) {
      return new Response(JSON.stringify({ error: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!run.storage_path) {
      return new Response(JSON.stringify({ error: "no_storage_archive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verifica permessi via RPC (riusa policy esistente)
    const { data: canBackup, error: rpcErr } = await userClient.rpc("assert_can_backup_brand", {
      p_brand_id: run.brand_id,
    });
    if (rpcErr || !canBackup) {
      return new Response(JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Genera signed URL valido 5 minuti
    const { data: signed, error: sErr } = await admin.storage
      .from("backup-archives")
      .createSignedUrl(run.storage_path, 300);
    if (sErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: "sign_failed", detail: sErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Audit (legacy audit_events + C10 backup_signed_url_audit)
    const expiresAtIso = new Date(Date.now() + 300 * 1000).toISOString();
    let internalUserId: string | null = null;
    try {
      const { data: uid } = await admin.rpc("get_user_id", { auth_user_id: userData.user.id });
      internalUserId = (uid as string | null) ?? null;
      await admin.from("audit_events").insert({
        brand_id: run.brand_id,
        actor_user_id: internalUserId,
        entity_type: "backup",
        entity_id: runId,
        action: "backup.download_signed",
        metadata: { storage_path: run.storage_path, expires_in: 300 },
      });
    } catch { /* non bloccare */ }
    try {
      if (internalUserId) {
        await admin.from("backup_signed_url_audit").insert({
          user_id: internalUserId,
          brand_id: run.brand_id,
          run_id: runId,
          storage_path: run.storage_path,
          expires_at: expiresAtIso,
        });
      }
    } catch { /* non bloccare */ }

    return new Response(JSON.stringify({
      signed_url: signed.signedUrl,
      expires_in: 300,
      path: run.storage_path,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "internal_error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
