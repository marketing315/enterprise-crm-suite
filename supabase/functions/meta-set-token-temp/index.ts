Deno.serve(async () => {
  const token = Deno.env.get("META_NEW_ACCESS_TOKEN")!;
  const pageId = "103625122097164";
  const pageTokRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${token}`);
  const pageToken = (await pageTokRes.json()).access_token || token;

  const ids = ["1526930192278168", "1950617768859224", "859201857097512"];
  const results: any[] = [];
  for (const id of ids) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${id}?fields=created_time,ad_id,ad_name,campaign_id,campaign_name,form_id,field_data&access_token=${pageToken}`);
    const j = await r.json();
    // mask phone/email partially
    if (j.field_data) {
      j.field_data = j.field_data.map((f: any) => ({
        name: f.name,
        sample: f.values?.[0] ? (f.name === "email" ? f.values[0].replace(/(.{2}).*@/, "$1***@") : f.values[0].slice(0, 4) + "***") : null,
      }));
    }
    results.push({ leadgen_id: id, ...j });
  }
  return new Response(JSON.stringify(results, null, 2), { headers: { "Content-Type": "application/json" } });
});
