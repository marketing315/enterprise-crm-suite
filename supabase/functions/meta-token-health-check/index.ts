// Stream 3 — Meta Token Health Check
// ----------------------------------------------------------------------------
// Calls GET /debug_token for each ACTIVE meta_apps row to monitor token health.
// Updates meta_apps.token_status / token_expires_at / token_scopes / token_last_error.
// Inserts append-only audit row in meta_token_health_runs.
// If token is invalid / revoked / expiring within EXPIRY_WARN_DAYS:
//   - calls report_client_incident RPC (PII-safe)
//   - flips is_active=false ONLY if hard invalid (not for expiring_soon)
//
// Triggered by:
//   - Internal cron via cron-relay (weekly, Mon 06:00 Europe/Rome)
//   - Manual call from admin UI (auth required)
//
// Auth model: accepts INTERNAL_SERVICE_TOKEN OR authenticated admin/CEO user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { META_GRAPH_BASE, withProof } from "../_shared/meta-graph.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_TOKEN = Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";

const EXPIRY_WARN_DAYS = 7;

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    type?: string;
    application?: string;
    expires_at?: number; // unix seconds; 0 = never
    data_access_expires_at?: number;
    is_valid?: boolean;
    scopes?: string[];
    user_id?: string;
    error?: { code?: number; message?: string };
  };
  error?: { code?: number; message?: string };
}

type RunResult = {
  meta_app_id: string;
  brand_id: string | null;
  page_id: string | null;
  status: "valid" | "invalid" | "expiring_soon" | "revoked" | "unknown";
  is_valid: boolean | null;
  expires_at: string | null;
  scopes: string[] | null;
  error_code: number | null;
  error_message: string | null;
  incident_created: boolean;
};

function safeMessage(msg: string | undefined | null): string {
  if (!msg) return "";
  // strip any token-like substrings (long hex/alnum) — defensive PII-safe logging
  return msg.replace(/[A-Za-z0-9_-]{40,}/g, "[REDACTED]").slice(0, 500);
}

async function checkOneApp(
  supabase: ReturnType<typeof createClient>,
  app: {
    id: string;
    brand_id: string | null;
    page_id: string | null;
    app_secret: string | null;
    access_token: string | null;
  },
  metaAppId: string,
  appAccessToken: string | null,
): Promise<RunResult> {
  const result: RunResult = {
    meta_app_id: metaAppId,
    brand_id: app.brand_id,
    page_id: app.page_id,
    status: "unknown",
    is_valid: null,
    expires_at: null,
    scopes: null,
    error_code: null,
    error_message: null,
    incident_created: false,
  };

  if (!app.access_token) {
    result.status = "unknown";
    result.error_message = "no_access_token_configured";
    return result;
  }

  // For /debug_token Meta requires `input_token` (the token to inspect)
  // and `access_token` (an app or admin token, here we pass the same token + appsecret_proof).
  const url = new URL(`${META_GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", app.access_token);
  const finalUrl = await withProof(url, app.access_token, app.app_secret);

  let json: DebugTokenResponse = {};
  let httpStatus = 0;
  try {
    const res = await fetch(finalUrl);
    httpStatus = res.status;
    json = await res.json() as DebugTokenResponse;
  } catch (err) {
    result.status = "unknown";
    result.error_message = safeMessage(err instanceof Error ? err.message : String(err));
    return result;
  }

  if (json.error) {
    result.error_code = json.error.code ?? null;
    result.error_message = safeMessage(json.error.message);
    // 190 / 102 → invalid/revoked
    if ([190, 102, 463, 464, 467].includes(json.error.code ?? 0)) {
      result.status = "revoked";
    } else {
      result.status = "invalid";
    }
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

  result.status = "unknown";
  return result;
}

async function persistResult(
  supabase: ReturnType<typeof createClient>,
  app: { id: string; brand_id: string | null },
  r: RunResult,
): Promise<void> {
  // Update meta_apps state (idempotent)
  const updates: Record<string, unknown> = {
    token_status: r.status,
    token_last_checked_at: new Date().toISOString(),
    token_expires_at: r.expires_at,
    token_scopes: r.scopes,
    token_last_error: r.status === "valid" ? null : r.error_message,
  };

  // Hard-invalid → mark inactive so dispatcher stops trying
  if (r.status === "invalid" || r.status === "revoked") {
    updates.is_active = false;
  }

  await supabase.from("meta_apps").update(updates).eq("id", app.id);

  // Audit row (service role bypasses RLS block-policies)
  await supabase.from("meta_token_health_runs").insert({
    meta_app_id: app.id,
    brand_id: r.brand_id,
    page_id: r.page_id,
    status: r.status,
    expires_at: r.expires_at,
    scopes: r.scopes,
    is_valid: r.is_valid,
    error_code: r.error_code,
    error_message: r.error_message,
    incident_created: r.incident_created,
  });
}

async function maybeCreateIncident(
  supabase: ReturnType<typeof createClient>,
  app: { id: string; brand_id: string | null; page_id: string | null },
  r: RunResult,
): Promise<boolean> {
  if (r.status === "valid" || r.status === "unknown") return false;

  const severity = r.status === "expiring_soon" ? "warning" : "critical";
  const code =
    r.status === "expiring_soon"
      ? "META_TOKEN_EXPIRING"
      : r.status === "revoked"
        ? "META_TOKEN_REVOKED"
        : "META_TOKEN_INVALID";

  try {
    await supabase.rpc("report_client_incident", {
      p_code: code,
      p_severity: severity,
      p_message: `Meta token ${r.status} for page ${app.page_id ?? "?"} (brand ${app.brand_id ?? "?"})`,
      p_context: {
        meta_app_id: app.id,
        brand_id: app.brand_id,
        page_id: app.page_id,
        status: r.status,
        expires_at: r.expires_at,
        error_code: r.error_code,
        error_message: r.error_message,
      },
    });
    return true;
  } catch (err) {
    console.error("[meta-token-health-check] report_client_incident failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: accept internal token OR authenticated user (admin/CEO check via RLS later if UI calls).
    const authHeader = req.headers.get("authorization") ?? "";
    const internalHeader = req.headers.get("x-internal-token") ?? "";
    const isInternal =
      INTERNAL_SERVICE_TOKEN &&
      (internalHeader === INTERNAL_SERVICE_TOKEN ||
        authHeader === `Bearer ${INTERNAL_SERVICE_TOKEN}`);

    if (!isInternal) {
      // Require valid Supabase auth + admin/CEO role
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Role check via has_role
      const adminSb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: uid } = await adminSb.rpc("get_user_id", { p_auth_uid: userData.user.id });
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

    const body = await req.json().catch(() => ({}));
    const onlyMetaAppId: string | undefined = body?.meta_app_id;

    let query = supabase
      .from("meta_apps")
      .select("id, brand_id, page_id, app_secret, access_token, is_active")
      .eq("is_active", true);

    if (onlyMetaAppId) query = query.eq("id", onlyMetaAppId);

    const { data: apps, error: listErr } = await query;
    if (listErr) {
      return new Response(JSON.stringify({ error: "list_failed", message: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ meta_app_id: string; status: string; incident: boolean }> = [];

    for (const app of apps ?? []) {
      const result = await checkOneApp(
        supabase,
        app as never,
        app.id as string,
        (app as { access_token: string | null }).access_token,
      );
      result.incident_created = await maybeCreateIncident(
        supabase,
        { id: app.id as string, brand_id: (app as { brand_id: string | null }).brand_id, page_id: (app as { page_id: string | null }).page_id },
        result,
      );
      await persistResult(supabase, { id: app.id as string, brand_id: (app as { brand_id: string | null }).brand_id }, result);
      results.push({
        meta_app_id: app.id as string,
        status: result.status,
        incident: result.incident_created,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[meta-token-health-check] fatal:", err);
    return new Response(
      JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
