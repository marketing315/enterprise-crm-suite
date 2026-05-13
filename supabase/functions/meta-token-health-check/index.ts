// Stream 3 — Meta Token Health Check
// ----------------------------------------------------------------------------
// Calls GET /debug_token for each ACTIVE meta_apps row.
// Updates meta_apps.token_status / token_expires_at / token_scopes / token_last_error.
// Inserts append-only audit row in meta_token_health_runs.
// Hard-invalid tokens (revoked / 190 / 102) → flips is_active=false so the
// dispatcher and webhook stop trying. expiring_soon does NOT flip is_active
// (just a warning logged in the audit run + admin UI).
//
// Auth model:
// - x-cron-secret header (CRON_SECRET) → from cron-relay
// - INTERNAL_SERVICE_TOKEN header / Bearer → internal callers
// - Otherwise: requires authenticated user with admin/CEO role
//
// Body (optional): { meta_app_id?: uuid }   → check only that app

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "../_shared/cors.ts";
import { META_GRAPH_BASE, withProof } from "../_shared/meta-graph.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const INTERNAL_SERVICE_TOKEN = Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";

const EXPIRY_WARN_DAYS = 7;

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    type?: string;
    expires_at?: number;
    data_access_expires_at?: number;
    is_valid?: boolean;
    scopes?: string[];
    error?: { code?: number; message?: string };
  };
  error?: { code?: number; message?: string };
}

type TokenStatus = "valid" | "invalid" | "expiring_soon" | "revoked" | "unknown";

type RunResult = {
  meta_app_id: string;
  brand_id: string | null;
  page_id: string | null;
  status: TokenStatus;
  is_valid: boolean | null;
  expires_at: string | null;
  scopes: string[] | null;
  error_code: number | null;
  error_message: string | null;
  raw_response: unknown;
};

function safeMessage(msg: string | null | undefined): string | null {
  if (!msg) return null;
  return msg.replace(/[A-Za-z0-9_-]{40,}/g, "[REDACTED]").slice(0, 500);
}

async function checkOneApp(app: {
  id: string;
  brand_id: string | null;
  page_id: string | null;
  app_secret: string | null;
  access_token: string | null;
}): Promise<RunResult> {
  const result: RunResult = {
    meta_app_id: app.id,
    brand_id: app.brand_id,
    page_id: app.page_id,
    status: "unknown",
    is_valid: null,
    expires_at: null,
    scopes: null,
    error_code: null,
    error_message: null,
    raw_response: null,
  };

  if (!app.access_token) {
    result.error_message = "no_access_token_configured";
    return result;
  }

  const url = new URL(`${META_GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", app.access_token);
  const finalUrl = await withProof(url, app.access_token, app.app_secret);

  let json: DebugTokenResponse = {};
  try {
    const res = await fetch(finalUrl);
    json = await res.json() as DebugTokenResponse;
  } catch (err) {
    result.error_message = safeMessage(err instanceof Error ? err.message : String(err));
    return result;
  }

  result.raw_response = json;

  if (json.error) {
    result.error_code = json.error.code ?? null;
    result.error_message = safeMessage(json.error.message);
    result.status = [190, 102, 463, 464, 467].includes(json.error.code ?? 0)
      ? "revoked"
      : "invalid";
    return result;
  }

  const d = json.data ?? {};
  result.is_valid = d.is_valid ?? null;
  result.scopes = d.scopes ?? null;

  if (d.expires_at && d.expires_at > 0) {
    result.expires_at = new Date(d.expires_at * 1000).toISOString();
  }

  if (d.is_valid === false) {
    result.status = "revoked";
    result.error_code = d.error?.code ?? null;
    result.error_message = safeMessage(d.error?.message);
    return result;
  }

  if (d.is_valid === true) {
    if (result.expires_at) {
      const msToExpiry = new Date(result.expires_at).getTime() - Date.now();
      if (msToExpiry < EXPIRY_WARN_DAYS * 24 * 3600 * 1000) {
        result.status = "expiring_soon";
        return result;
      }
    }
    result.status = "valid";
    return result;
  }

  return result;
}

async function persistResult(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  r: RunResult,
): Promise<void> {
  const updates: Record<string, unknown> = {
    token_status: r.status,
    token_last_checked_at: new Date().toISOString(),
    token_expires_at: r.expires_at,
    token_scopes: r.scopes,
    token_last_error: r.status === "valid" ? null : r.error_message,
  };

  if (r.status === "invalid" || r.status === "revoked") {
    updates.is_active = false;
  }

  await supabase.from("meta_apps").update(updates).eq("id", r.meta_app_id);

  await supabase.from("meta_token_health_runs").insert({
    meta_app_id: r.meta_app_id,
    brand_id: r.brand_id,
    page_id: r.page_id,
    status: r.status,
    expires_at: r.expires_at,
    scopes: r.scopes,
    is_valid: r.is_valid,
    error_code: r.error_code,
    error_message: r.error_message,
    raw_response: r.raw_response ?? null,
    incident_created: r.status !== "valid" && r.status !== "unknown",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const internalHeader = req.headers.get("x-internal-token") ?? "";

    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;
    const isInternal =
      INTERNAL_SERVICE_TOKEN &&
      (internalHeader === INTERNAL_SERVICE_TOKEN ||
        authHeader === `Bearer ${INTERNAL_SERVICE_TOKEN}`);

    if (!isCron && !isInternal) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminSb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: uid } = await adminSb.rpc("get_user_id", { _auth_uid: userData.user.id });
      const [{ data: isAdmin }, { data: isCeo }] = await Promise.all([
        adminSb.rpc("has_role", { _user_id: uid, _role: "admin" }),
        adminSb.rpc("has_role", { _user_id: uid, _role: "ceo" }),
      ]);
      if (!isAdmin && !isCeo) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({} as { meta_app_id?: string }));
    const onlyMetaAppId = (body as { meta_app_id?: string })?.meta_app_id;

    let query = supabase
      .from("meta_apps")
      .select("id, brand_id, page_id, app_secret, access_token, is_active")
      .eq("is_active", true);

    if (onlyMetaAppId) query = query.eq("id", onlyMetaAppId);

    const { data: apps, error: listErr } = await query;
    if (listErr) {
      return new Response(
        JSON.stringify({ error: "list_failed", message: listErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ meta_app_id: string; status: TokenStatus }> = [];

    for (const app of (apps ?? []) as Array<{
      id: string;
      brand_id: string | null;
      page_id: string | null;
      app_secret: string | null;
      access_token: string | null;
    }>) {
      const result = await checkOneApp(app);
      await persistResult(supabase, result);
      results.push({ meta_app_id: app.id, status: result.status });
    }

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[meta-token-health-check] fatal:", err);
    return new Response(
      JSON.stringify({
        error: "internal",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
