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
