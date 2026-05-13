// Stream 2 — List Meta Pages / Businesses / Ad Accounts available to the
// connected Meta user (after OAuth completed via meta-oauth-callback).
//
// Auth: Bearer JWT of an admin/CEO of the requested brand_id.
// Body: { brand_id: uuid }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { metaGraphUrl, withProof } from "../_shared/meta-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const META_APP_SECRET = Deno.env.get("META_OAUTH_APP_SECRET") ?? "";

interface FbErr { code?: number; message?: string }
interface FbList<T> { data?: T[]; error?: FbErr }

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchPaged<T>(
  baseUrl: URL,
  token: string,
  appSecret: string,
): Promise<{ data: T[]; error?: FbErr }> {
  const collected: T[] = [];
  let next: string | null = await withProof(baseUrl, token, appSecret);
  let safety = 10;
  while (next && safety-- > 0) {
    const res = await fetch(next);
    const json = (await res.json()) as FbList<T> & { paging?: { next?: string } };
    if (json.error) return { data: collected, error: json.error };
    if (json.data) collected.push(...json.data);
    next = (json as { paging?: { next?: string } }).paging?.next ?? null;
  }
  return { data: collected };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return jsonResp({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as { brand_id?: string }));
    const brandId = (body as { brand_id?: string })?.brand_id;
    if (!brandId) return jsonResp({ error: "brand_id_required" }, 422);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: crmUser } = await admin
      .from("users").select("id").eq("supabase_auth_id", userData.user.id).maybeSingle();
    if (!crmUser) return jsonResp({ error: "user_not_found" }, 404);

    const { data: role } = await admin
      .from("user_roles").select("id")
      .eq("user_id", crmUser.id).eq("brand_id", brandId).in("role", ["admin", "ceo"])
      .limit(1).maybeSingle();
    if (!role) return jsonResp({ error: "forbidden" }, 403);

    // Resolve user OAuth token (saved by meta-oauth-callback in oauth_tokens + vault).
    const { data: oauthRow } = await admin
      .from("oauth_tokens").select("id, expires_at")
      .eq("brand_id", brandId).eq("provider", "meta_ads")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (!oauthRow?.id) {
      return jsonResp({ error: "oauth_not_completed", message: "Connetti prima Meta via OAuth" }, 400);
    }

    const { data: tokenStr, error: vaultErr } = await admin
      .rpc("vault_get_oauth_secret", { p_token_id: oauthRow.id, p_kind: "access" });
    if (vaultErr || !tokenStr) {
      return jsonResp({ error: "token_unavailable", message: vaultErr?.message ?? "vault_miss" }, 500);
    }
    const userToken = tokenStr as string;

    // 1) Pages
    const pagesUrl = new URL(metaGraphUrl("/me/accounts"));
    pagesUrl.searchParams.set("fields", "id,name,category,tasks");
    pagesUrl.searchParams.set("limit", "100");

    // 2) Businesses
    const busUrl = new URL(metaGraphUrl("/me/businesses"));
    busUrl.searchParams.set("fields", "id,name");
    busUrl.searchParams.set("limit", "100");

    // 3) Ad accounts
    const adUrl = new URL(metaGraphUrl("/me/adaccounts"));
    adUrl.searchParams.set("fields", "account_id,name,currency,account_status");
    adUrl.searchParams.set("limit", "100");

    const [pages, businesses, adAccounts] = await Promise.all([
      fetchPaged<{ id: string; name: string; category?: string; tasks?: string[] }>(pagesUrl, userToken, META_APP_SECRET),
      fetchPaged<{ id: string; name: string }>(busUrl, userToken, META_APP_SECRET),
      fetchPaged<{ account_id: string; name: string; currency?: string; account_status?: number }>(adUrl, userToken, META_APP_SECRET),
    ]);

    // If pages errored hard (e.g. token expired), bubble it
    const firstErr = pages.error ?? businesses.error ?? adAccounts.error;
    if (firstErr && pages.data.length === 0) {
      return jsonResp({ error: "graph_error", code: firstErr.code, message: firstErr.message }, 400);
    }

    return jsonResp({
      pages: pages.data,
      businesses: businesses.data,
      ad_accounts: adAccounts.data.map((a) => ({
        id: a.account_id.startsWith("act_") ? a.account_id : `act_${a.account_id}`,
        name: a.name,
        currency: a.currency,
        status: a.account_status,
      })),
      warnings: firstErr ? [{ code: firstErr.code, message: firstErr.message }] : undefined,
    });
  } catch (err) {
    console.error("[meta-list-pages] fatal:", err);
    return jsonResp({ error: "internal", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
