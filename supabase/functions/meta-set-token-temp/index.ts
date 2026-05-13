import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  const token = Deno.env.get("META_NEW_ACCESS_TOKEN")!;
  const pageId = "103625122097164";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const pageTokRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${token}`);
  const pageToken = (await pageTokRes.json()).access_token || token;

  const formsRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/leadgen_forms?fields=id,name,leads_count&limit=200&access_token=${pageToken}`);
  const formsJson = await formsRes.json();

  const allMetaLeads: { leadgen_id: string; form_id: string; form_name: string; created_time: string; is_test: boolean; preview: any }[] = [];

  for (const form of (formsJson.data || [])) {
    if (!form.leads_count) continue;
    let url: string | null = `https://graph.facebook.com/v20.0/${form.id}/leads?fields=id,created_time,field_data&limit=100&access_token=${pageToken}`;
    while (url) {
      const r: any = await fetch(url);
      const j: any = await r.json();
      for (const lead of (j.data || [])) {
        const fd = lead.field_data || [];
        const email = fd.find((f: any) => f.name === "email")?.values?.[0] || "";
        const isTest = email === "test@meta.com" || fd.some((f: any) => (f.values?.[0] || "").includes("<test lead:"));
        const fname = fd.find((f: any) => ["first_name","nome"].includes(f.name))?.values?.[0] || "";
        const phone = fd.find((f: any) => f.name === "phone_number")?.values?.[0] || "";
        allMetaLeads.push({
          leadgen_id: lead.id,
          form_id: form.id,
          form_name: form.name,
          created_time: lead.created_time,
          is_test: isTest,
          preview: { name: fname.slice(0,4)+"***", email: email.replace(/(.{2}).*@/, "$1***@"), phone: phone.slice(0,5)+"***" },
        });
      }
      url = j.paging?.next || null;
    }
  }

  // Cross-check with DB
  const ids = allMetaLeads.map((l) => l.leadgen_id);
  const { data: existing } = await supabase
    .from("meta_lead_events")
    .select("leadgen_id, status")
    .in("leadgen_id", ids);
  const existingMap = new Map((existing || []).map((r: any) => [r.leadgen_id, r.status]));

  const missing = allMetaLeads.filter((l) => !l.is_test && !existingMap.has(l.leadgen_id));
  const stuck = allMetaLeads.filter((l) => !l.is_test && existingMap.get(l.leadgen_id) === "ingested");

  return new Response(JSON.stringify({
    total_meta_leads: allMetaLeads.length,
    real_leads: allMetaLeads.filter((l) => !l.is_test).length,
    test_leads: allMetaLeads.filter((l) => l.is_test).length,
    in_db: existing?.length || 0,
    missing_in_db: missing.length,
    stuck_in_db: stuck.length,
    missing,
    stuck,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
