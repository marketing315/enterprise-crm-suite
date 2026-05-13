Deno.serve(async () => {
  const token = Deno.env.get("META_NEW_ACCESS_TOKEN")!;
  const pageId = "103625122097164";

  // Resolve page access token from user/system token
  const pageTokRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=access_token,name&access_token=${token}`);
  const pageTokJson = await pageTokRes.json();
  const pageToken = pageTokJson.access_token || token;

  // List all lead forms on the page
  const formsRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/leadgen_forms?fields=id,name,status,leads_count,created_time&limit=200&access_token=${pageToken}`);
  const formsJson = await formsRes.json();

  // Search for the 2 specific leadgen IDs across forms
  const targetIds = ["2175957616496043", "1637716710662561"];
  const results: any[] = [];
  for (const form of (formsJson.data || [])) {
    if (!form.leads_count) continue;
    const leadsRes = await fetch(`https://graph.facebook.com/v20.0/${form.id}/leads?fields=id,created_time,ad_id&limit=200&access_token=${pageToken}`);
    const leadsJson = await leadsRes.json();
    const ids = (leadsJson.data || []).map((l: any) => l.id);
    const hits = ids.filter((id: string) => targetIds.includes(id));
    results.push({
      form_id: form.id,
      form_name: form.name,
      status: form.status,
      leads_count: form.leads_count,
      api_returned: ids.length,
      lead_ids_sample: ids.slice(0, 5),
      target_hits: hits,
      error: leadsJson.error || null,
    });
  }

  return new Response(JSON.stringify({
    page: pageTokJson.name,
    page_token_resolved: !!pageTokJson.access_token,
    forms_total: (formsJson.data || []).length,
    forms: results,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
