# Architecture rules

- Meta lead brand = active rule in `meta_form_brand_routes` for (meta_app, form_id), else the Meta App's brand, resolved via `_shared/meta-form-routing.ts` (fail-open to app brand) — lets one page feed multiple brands without ever losing leads.
