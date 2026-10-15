// Shared helpers to resolve the human-readable Meta lead form name
// ("modulo di contatto") for a lead, used by the Google Sheets exporters
// (sheets-export and sheets-leads-export) to enrich the AdSet column.
//
// Resolution order:
//   1. Configured names in meta_form_brand_routes / meta_form_email_recipients /
//      meta_form_sheet_exclusions (form_id → form_name).
//   2. Meta Graph API `/{form_id}?fields=name` with the lead source token,
//      one call per form, cached by the caller for the duration of the run.
//
// Fail-open: on any error the name stays empty and callers fall back to the
// plain adset value — no lead is ever lost because of a name lookup.

// deno-lint-ignore no-explicit-any
type Client = any;

import { getMetaLeadSourceAccessToken } from "./meta-secrets.ts";

export async function buildFormNameMap(supabaseAdmin: Client): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const tables = ["meta_form_brand_routes", "meta_form_email_recipients", "meta_form_sheet_exclusions"];
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select("form_id, form_name");
    if (error) {
      console.error(`[meta-form-name] ${table} error:`, error.message);
      continue;
    }
    for (const row of data || []) {
      if (row.form_id && row.form_name && !map.has(row.form_id)) {
        map.set(row.form_id, row.form_name);
      }
    }
  }
  return map;
}

export async function resolveMetaFormNames(
  supabaseAdmin: Client,
  formIds: string[],
  nameMap: Map<string, string>,
): Promise<void> {
  const missing = [...new Set(formIds)].filter((id) => id && !nameMap.has(id));
  if (missing.length === 0) return;

  // Map form_id → source_id via meta_lead_events (any row with that form).
  const { data: mleRows, error } = await supabaseAdmin
    .from("meta_lead_events")
    .select("form_id, source_id")
    .in("form_id", missing)
    .limit(1000);
  if (error) {
    console.error("[meta-form-name] meta_lead_events lookup error:", error.message);
    return;
  }
  const sourceByForm = new Map<string, string>();
  for (const r of mleRows || []) {
    if (r.form_id && r.source_id && !sourceByForm.has(r.form_id)) {
      sourceByForm.set(r.form_id, r.source_id);
    }
  }

  const tokenBySource = new Map<string, string | null>();
  for (const formId of missing) {
    const sourceId = sourceByForm.get(formId);
    if (!sourceId) continue;
    if (!tokenBySource.has(sourceId)) {
      tokenBySource.set(sourceId, await getMetaLeadSourceAccessToken(supabaseAdmin, sourceId));
    }
    const token = tokenBySource.get(sourceId);
    if (!token) continue;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${formId}?fields=name&access_token=${encodeURIComponent(token)}`,
      );
      const data = await res.json();
      if (res.ok && data?.name) {
        nameMap.set(formId, data.name);
      } else {
        console.warn("[meta-form-name] graph error for form", formId, data?.error?.message || res.status);
      }
    } catch (err) {
      console.warn("[meta-form-name] fetch failed for form", formId, err instanceof Error ? err.message : String(err));
    }
  }
}

/** Compose the AdSet cell: adset value plus the Meta form name when known. */
export function composeAdsetCell(adset: string, formName?: string): string {
  if (formName) {
    return adset ? `${adset} — Modulo: ${formName}` : `Modulo: ${formName}`;
  }
  return adset;
}
