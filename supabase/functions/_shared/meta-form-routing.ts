// Per-form brand routing for Meta Lead Ads.
// Returns the target brand for a lead: an active rule in meta_form_brand_routes
// for (meta_app_id, form_id) wins; otherwise the Meta App's own brand.
// Fail-open: any error falls back to the Meta App brand so no lead is ever lost.

// deno-lint-ignore no-explicit-any
export async function resolveTargetBrand(
  supabase: any,
  metaApp: { id: string; brand_id: string },
  formId: string | null | undefined,
): Promise<string> {
  if (!formId) return metaApp.brand_id;
  try {
    const { data, error } = await supabase
      .from("meta_form_brand_routes")
      .select("target_brand_id")
      .eq("meta_app_id", metaApp.id)
      .eq("form_id", String(formId))
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      console.error("[META-ROUTING] lookup error, fallback to app brand:", error.message);
      return metaApp.brand_id;
    }
    if (data?.target_brand_id) {
      console.log(`[META-ROUTING] form ${formId} → brand ${data.target_brand_id}`);
      return data.target_brand_id as string;
    }
  } catch (e) {
    console.error("[META-ROUTING] exception, fallback to app brand:", e instanceof Error ? e.message : String(e));
  }
  return metaApp.brand_id;
}
