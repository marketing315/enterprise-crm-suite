// Lists Lead Ads forms (id, name, status) of a Meta App's page.
// Auth: Bearer JWT of an admin/CEO of the Meta App's brand. Body: { meta_app_id: uuid }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMetaAppAccessToken, resolveMetaPageAccessToken } from "../_shared/meta-secrets.ts";
import { metaGraphUrl, withProof } from "../_shared/meta-graph.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const metaAppId = (body as { meta_app_id?: string }).meta_app_id;
    if (!metaAppId || !/^[0-9a-f-]{36}$/i.test(metaAppId)) return json({ error: "meta_app_id_required" }, 422);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: app } = await admin.from("meta_apps").select("id, brand_id, page_id, app_secret, access_token").eq("id", metaAppId).maybeSingle();
    if (!app) return json({ error: "not_found" }, 404);

    const { data: crmUser } = await admin.from("users").select("id").eq("supabase_auth_id", u.user.id).maybeSingle();
    if (!crmUser) return json({ error: "forbidden" }, 403);
    const { data: role } = await admin.from("user_roles").select("id").eq("user_id", crmUser.id)
      .eq("brand_id", app.brand_id).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (!role) return json({ error: "forbidden" }, 403);
    if (!app.page_id) return json({ forms: [], message: "page_id mancante" });

    const stored = (await getMetaAppAccessToken(admin, app.id)) ?? app.access_token;
    if (!stored) return json({ error: "token_unavailable" }, 500);
    const token = await resolveMetaPageAccessToken(stored, app.page_id);

    const forms: Array<{ id: string; name: string; status?: string; created_time?: string; leads_count?: number }> = [];
    const first = new URL(metaGraphUrl(`/${app.page_id}/leadgen_forms`));
    first.searchParams.set("fields", "id,name,status,created_time,leads_count");
    first.searchParams.set("limit", "100");
    let next: string | null = await withProof(first, token, app.app_secret);
    let guard = 10;
    while (next && guard-- > 0) {
      const res = await fetch(next);
      const j = await res.json();
      if (!res.ok || j.error) {
        console.error(`[meta-list-forms] graph error [${res.status}]`, j.error?.message);
        return json({ error: "graph_error", status: res.status, message: j.error?.message, forms }, 502);
      }
      forms.push(...(j.data ?? []));
      next = j.paging?.next ?? null;
    }
    forms.sort((a, b) => (b.created_time ?? "").localeCompare(a.created_time ?? ""));
    return json({ forms });
  } catch (e) {
    console.error("[meta-list-forms] fatal", e);
    return json({ error: "internal", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
