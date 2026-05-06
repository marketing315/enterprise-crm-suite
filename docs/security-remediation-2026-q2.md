# Security Remediation — Q2 2026

## H14 — raw_text AI persistito (CHIUSO)

**Status**: Chiuso strutturalmente da C6.

**Risoluzione**: `parse-sale-document` non persiste più `raw_text` AI libero. L'output dell'LLM è forzato a schema Zod strict (`ParsedSaleSchema` in `_shared/ai-output-validate.ts`) con `response_format: json_schema strict` e cap su lunghezze/range. Risposte non conformi → HTTP 422, nessun salvataggio.

**Nota su `incoming_requests.raw_body_text`**: La colonna `raw_body_text` su `incoming_requests` ha generato dubbi durante la verifica ma è uno scope completamente diverso e legittimo: è il fallback per webhook ingest il cui body non è parsabile come JSON (necessario per debugging di integrazioni terze parti). È coperta dalla retention di 90 giorni definita in H4/A3 (soft-delete + audit hash chain) e non contiene mai output AI.

**Riferimenti**:
- `supabase/functions/parse-sale-document/index.ts`
- `supabase/functions/_shared/ai-output-validate.ts`
- `mem://features/h14-parse-sale-structured-output`
- `mem://technical/ai-output-zod-strict`

---

## H1–H13 — Code-review checklist (consolidata)

Le 11 H già chiuse hanno regole di non-regressione documentate in `docs/security-review-playbook.md` § 3 "Code-Review Checklist — Hardening Audit Q2 2026". CI guard attivi:

- `scripts/ci/check-public-webhooks-ratelimit.sh` (H1) — wired allowlist + backlog TODO.
- `scripts/ci/check-edge-error-leak.sh` (H6) — baseline 25 violazioni esistenti, nuove violazioni bloccano il merge.
- `scripts/ci/check-soft-delete-rls.sh` (H4).
- `scripts/ci/check-sri-and-i18n.mjs` (H9).
- `scripts/ci/check-sourcemaps.mjs` (H10).

Tutti integrati in `.github/workflows/code-hygiene.yml`.

### Backlog tecnico

- **H1 backlog**: `meta-leads-webhook`, `webhook-ingest`, `webhook-dispatcher` ancora senza IP rate-limit (warning, non error). Da chiudere in PR successivi.
- **H5 deprecation**: header legacy `x-internal-token` in `_shared/internal-mtls.ts` ha TODO con target **Q3 2026** per rimozione totale.
- **H6 baseline**: 25 violazioni esistenti `error: err.message` da bonificare progressivamente. Ogni cleanup PR può abbassare la baseline con `bash scripts/ci/check-edge-error-leak.sh --update-baseline`.
