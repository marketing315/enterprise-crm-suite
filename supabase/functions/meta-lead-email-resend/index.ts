// TEMPORARY: resend the latest Meta lead notification email. Remove after use.
import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyMetaLeadByEmail } from "../_shared/meta-lead-email-notify.ts";
Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return new Response("unauthorized", { status: 401 });
    const { data: r } = await sb.from("meta_form_email_recipients").select("meta_app_id, form_id").eq("is_active", true).limit(1).maybeSingle();
    if (!r) return Response.json({ error: "no recipients" }, { status: 422 });
    const { data: ev } = await sb.from("meta_lead_events").select("*").eq("form_id", r.form_id).order("received_at", { ascending: false }).limit(1).maybeSingle();
    if (!ev) return Response.json({ error: "no lead" }, { status: 422 });
    const p = ev.fetched_payload ?? {};
    const get = (n: string) => (p.field_data ?? []).find((f: any) => f.name === n)?.values?.[0] ?? null;
    await notifyMetaLeadByEmail(sb, {
      metaAppId: r.meta_app_id, formId: ev.form_id, leadgenId: ev.leadgen_id, brandId: ev.brand_id,
      leadData: p, firstName: get("first_name") ?? get("full_name"), lastName: get("last_name"),
      phone: get("phone_number"), email: get("email"), city: get("city"),
      idempotencySuffix: `-resend-${Date.now()}`,
    });
    return Response.json({ ok: true, leadgen: ev.leadgen_id });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
});
