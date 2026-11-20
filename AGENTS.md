# Architecture rules

- Meta lead brand = active rule in `meta_form_brand_routes` for (meta_app, form_id), else the Meta App's brand, resolved via `_shared/meta-form-routing.ts` (fail-open to app brand) — lets one page feed multiple brands without ever losing leads.
- Webhook Sheets jobs are enqueued through `_shared/webhook-ingest/sheets-enqueue.ts` with the caller's admin client; duplicate jobs remain untouched so retries are durable without resetting successful exports.
- Recovery manifests use `scripts/lead-sheet-audit.mjs` to compare actual sheet rows one-to-one by Rome minute, brand, source and identity; expired export logs alone never justify appending a row.
