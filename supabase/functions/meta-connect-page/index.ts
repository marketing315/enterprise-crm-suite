// Stream 2 — Connect a Facebook Page to a brand: fetches Page Token,
// upserts meta_apps row, and subscribes the page to leadgen webhook.
//
// Auth: Bearer JWT of an admin/CEO of the requested brand_id.
// Body: { brand_id: uuid, page_id: string, ad_account_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { metaGraphUrl, withProof, proofParams } from "../_shared/meta-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const META_APP_SECRET = Deno.env.get("META_OAUTH_APP_SECRET") ?? "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateVerifyToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!META_APP_SECRET) {
      return jsonResp({ error: "server_misconfigured", message: "META_OAUTH_APP_SECRET missing" }, 500);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return jsonResp({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const brandId: string | undefined = body?.brand_id;
    const pageId: string | undefined = body?.page_id;
    const adAccountId: string | undefined = body?.ad_account_id;

    if (!brandId || !pageId) {
      return jsonResp({ error: "missing_params", message: "brand_id e page_id richiesti" }, 422);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Auth: admin/ceo on brand
    const { data: crmUser } = await admin
      .from("users").select("id").eq("supabase_auth_id", userData.user.id).maybeSingle();
    if (!crmUser) return jsonResp({ error: "user_not_found" }, 404);

    const { data: role } = await admin
      .from("user_roles").select("id")
      .eq("user_id", crmUser.id).eq("brand_id", brandId).in("role", ["admin", "ceo"])
      .limit(1).maybeSingle();
    if (!role) return jsonResp({ error: "forbidden" }, 403);

    // Resolve user OAuth token
    const { data: oauthRow } = await admin
      .from("oauth_tokens").select("id")
      .eq("brand_id", brandId).eq("provider", "meta_ads")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!oauthRow?.id) {
      return jsonResp({ error: "oauth_not_completed" }, 400);
    }
    const { data: tokenStr, error: vaultErr } = await admin
      .rpc("vault_get_oauth_secret", { p_token_id: oauthRow.id, p_kind: "access" });
    if (vaultErr || !tokenStr) {
      return jsonResp({ error: "token_unavailable", message: vaultErr?.message }, 500);
    }
    const userToken = tokenStr as string;

    // Fetch brand slug for meta_apps.brand_slug fallback
    const { data: brandRow } = await admin
      .from("brands").select("slug, name").eq("id", brandId).maybeSingle();
    const brandSlug = brandRow?.slug ?? `brand-${brandId.slice(0, 8)}`;

    // 1) Get Page Token + Page name
    const pageInfoUrl = new URL(metaGraphUrl(`/${pageId}`));
    pageInfoUrl.searchParams.set("fields", "access_token,name,category");
    const pageInfoRes = await fetch(await withProof(pageInfoUrl, userToken, META_APP_SECRET));
    const pageInfo = await pageInfoRes.json() as {
      access_token?: string;
      name?: string;
      category?: string;
      error?: { code?: number; message?: string };
    };
    if (pageInfo.error || !pageInfo.access_token) {
      return jsonResp({
        error: "page_token_unavailable",
        code: pageInfo.error?.code,
        message: pageInfo.error?.message ?? "Page access_token non disponibile (scope insufficiente o pagina non gestita)",
      }, 400);
    }
    const pageToken = pageInfo.access_token;
    const pageName = pageInfo.name ?? pageId;

    // 2) Subscribe page to leadgen webhook
    const subUrl = new URL(metaGraphUrl(`/${pageId}/subscribed_apps`));
    const proofs = await proofParams(pageToken, META_APP_SECRET);
    const subForm = new URLSearchParams();
    subForm.set("subscribed_fields", "leadgen");
    subForm.set("access_token", proofs.access_token);
    if (proofs.appsecret_proof) subForm.set("appsecret_proof", proofs.appsecret_proof);

    const subRes = await fetch(subUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: subForm.toString(),
    });
    const subJson = await subRes.json() as { success?: boolean; error?: { code?: number; message?: string } };
    if (subJson.error) {
      console.error("[meta-connect-page] subscribed_apps error:", subJson.error);
      // Continua comunque — alcuni casi (page già subscribed) ritornano success implicito
    }
    const subscribed = subJson.success === true || (!subJson.error);

    // 3) Upsert meta_apps row (1 brand = 1 row → match by brand_id)
    const { data: existing } = await admin
      .from("meta_apps").select("id, brand_slug")
      .eq("brand_id", brandId).maybeSingle();

    const baseFields = {
      brand_id: brandId,
      brand_slug: existing?.brand_slug ?? brandSlug,
      page_id: pageId,
      access_token: pageToken,
      app_secret: META_APP_SECRET,
      is_active: true,
      ad_account_id: adAccountId ?? null,
      token_status: "valid",
      token_last_checked_at: new Date().toISOString(),
      token_last_error: null,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;

    let metaAppId: string;
    if (existing?.id) {
      const { data: upd, error: updErr } = await admin
        .from("meta_apps").update(baseFields).eq("id", existing.id).select("id").single();
      if (updErr) return jsonResp({ error: "db_update_failed", message: updErr.message }, 500);
      metaAppId = upd.id as string;
    } else {
      const { data: ins, error: insErr } = await admin
        .from("meta_apps").insert({
          ...baseFields,
          verify_token: generateVerifyToken(),
        }).select("id").single();
      if (insErr) return jsonResp({ error: "db_insert_failed", message: insErr.message }, 500);
      metaAppId = ins.id as string;
    }

    // 4) Audit log + health-run audit row
    await admin.rpc("log_audit_event", {
      p_entity_type: "meta_app",
      p_action: "META_PAGE_CONNECTED",
      p_brand_id: brandId,
      p_entity_id: metaAppId,
      p_new_value: { page_id: pageId, page_name: pageName, ad_account_id: adAccountId ?? null, subscribed },
      p_metadata: { source: "meta-connect-page" },
    }).then(() => {}, (e: unknown) => console.warn("[meta-connect-page] audit log failed:", e));

    await admin.from("meta_token_health_runs").insert({
      meta_app_id: metaAppId,
      brand_id: brandId,
      page_id: pageId,
      status: "valid",
      is_valid: true,
    }).then(() => {}, () => {});

    return jsonResp({
      ok: true,
      meta_app_id: metaAppId,
      page_id: pageId,
      page_name: pageName,
      ad_account_id: adAccountId ?? null,
      subscribed,
    });
  } catch (err) {
    console.error("[meta-connect-page] fatal:", err);
    return jsonResp({ error: "internal", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
