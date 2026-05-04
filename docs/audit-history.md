# Audit History — Inline Code References

This file preserves the cross-reference between historical security/hardening
audit findings (codes `Bxx`, `Hxx`, `Rxx`) and the lines of code that
implemented their fixes. Inline `// B07 fix:` style comments have been removed
from the source so future readers don't conflate "old fix marker" with "open
bug" — the canonical history lives here.

## Why this file exists

Earlier audits issued ID-coded findings:

- `Bxx` — Backend / edge function security (auth, validation, DoS, secrets)
- `Hxx` — Hardening (HMAC, XSS, race conditions, stale state)
- `Rxx` — Resilience / runtime safety (state validation, error handling)

Each fix was annotated inline (`// B03 fix: enforce max body size`). Over time
this became noise: a developer reading the code couldn't tell whether the
marker meant "do not regress" or "open finding". We now treat fixes as
**resolved**: the code stands on its own, and this file is the audit trail.

## Discovery rule (enforced in CI)

`scripts/security/check-audit-codes.sh` fails the build if any new inline
audit code is added in `src/` or `supabase/functions/` (test files exempt).
Re-introducing such a marker means the fix is incomplete — open a tracked
ticket instead.

## Historical findings inventory

Generated from the pre-cleanup state of the repository. Codes seen across
27 files, 71 inline annotations:

```
B01 B02 B03 B04 B05 B06 B07 B08 B09 B10 B11 B13 B14 B15 B16
H01 H02 H03 H04 H05 H06 H07 H10 H11 H12
R01 R02 R03 R07 R08 R09
```

### Per-file footprint at cleanup time

| File | Codes (count) |
|---|---|
| `supabase/functions/webhook-ingest/index.ts` | 12 (B01, B03–B10) |
| `src/contexts/AuthContext.tsx` | 9 (H01–H03, B2, R07) |
| `supabase/functions/capi-event-sender/index.ts` | 7 |
| `supabase/functions/admin-manage-users/index.ts` | 6 |
| `supabase/functions/admin-manage-team/index.ts` | 4 |
| `supabase/functions/admin-create-user/index.ts` | 3 |
| `supabase/functions/automation-runner/index.ts` | 3 |
| `supabase/functions/google-oauth-callback/index.ts` | 3 |
| `supabase/functions/voispeed-call-request/index.ts` | 2 |
| `supabase/functions/automation-jobs-dispatcher/index.ts` | 2 |
| `supabase/functions/google-oauth-start/index.ts` | 2 |
| `src/hooks/usePWAInstall.ts` | 2 |
| `src/pages/AdminCapiMonitor.tsx` | 2 |
| 14 other files | 1 each |

### Topical map (what each code family addressed)

- **B01 / B03 / B04 / B07 (webhook-ingest)** — early auth gate, payload size
  cap (256KB), platform-trusted IP headers, env-var validation.
- **B05 (webhook-ingest)** — UTF-16 vs byte-length DoS regression.
- **B06 (webhook-ingest)** — HMAC misconfig rejection + query-string api_key
  fallback for platforms without custom-header support.
- **B08 / B09 / B10 (webhook-ingest)** — JSON-validate before consuming
  rate-limit token; per-source schema validation; idempotency / replay dedup.
- **B11 (voispeed-call-request)** — verify user *and* contact belong to
  requested brand before placing a call.
- **B16 (google-oauth-start)** — verify caller has admin/ceo role on brand
  before issuing OAuth state.
- **B01–B04 (cron edges: sla-breach-checker, ticket-assign-recovery,
  generate-weekly-report, send-n8n-webhook, ai-classify, sheets-kpi-refresh,
  webhook-dispatcher)** — accept either valid cron secret OR server-verified
  service_role JWT; reject anon.
- **H01–H03 (AuthContext)** — stable `fetchUserData` with stale-check via ref,
  prevent double-fetch race, only flip `isLoading=false` after fetch settles.
- **H05–H06 (google-oauth-callback)** — sign OAuth state with HMAC, HTML-escape
  on callback render to prevent XSS.
- **H11 (AdminCapiMonitor)** — `refreshKey` forces `from/to` recalc on manual
  refresh.
- **R01 (cron edges)** — same hardening as B01–B04 family on weekly-report and
  sheets-kpi-refresh paths.
- **R03 (useTicketUrlState, ContactsBulkActionsBar)** — strict cursor field
  validation; per-row brand_id (not session brand) for bulk ops.
- **R07 (AuthContext)** — reset auth state on fetch error to prevent stale
  privileges leaking into UI.
- **R08 (BrandContext / brand-context.test)** — clear invalid stored brand
  from localStorage on mismatch.

## Re-opening a finding

If a regression is discovered, do **not** add a `// Bxx fix:` marker. Instead:

1. Open a tracked issue referencing the original code (e.g. "Regression of
   B03 — body size cap bypass").
2. Reference this file in the PR description.
3. Update the topical map above with the new resolution date.

## Cleanup script

`scripts/cleanup/strip-audit-codes.mjs` performs the original strip. It is
safe to re-run idempotently — string literals (e.g. spreadsheet `B11/30` cell
refs) and `*.test.ts` / `*.spec.ts` files are excluded.
