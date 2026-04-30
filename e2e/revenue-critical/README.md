# Revenue-Critical E2E Tests

Smoke + integration tests for the **5 revenue-critical flows**.
If any of these break, the business loses money.

## Flows

| # | Flow | File | Why critical |
|---|------|------|--------------|
| 1 | Lead Ingestion | `01-lead-ingestion.e2e.spec.ts` | Every paid lead enters here |
| 2 | Pipeline Stage Move | `02-pipeline-stage-move.e2e.spec.ts` | Drives contact_status & automation |
| 3 | Appointment Lifecycle | `03-appointment-lifecycle.e2e.spec.ts` | No-show rate = revenue impact |
| 4 | Sales Flow | `04-sales-flow.e2e.spec.ts` | Records revenue + margins |
| 5 | MCP Server | `05-mcp-subscriptions.e2e.spec.ts` | External AI agent integrations |
| 1d | Lead Ingestion (DEEP) | `01-lead-ingestion-deep.e2e.spec.ts` | Verifies DB persistence: contact + lead_event row appended, dedup on duplicate phone |
| 2d | Pipeline Stage Move (DEEP) | `02-pipeline-stage-move-deep.e2e.spec.ts` | Snapshot RPC exposes deals counters + transitions for ingested contact |
| 3d | Appointment Lifecycle (DEEP) | `03-appointment-lifecycle-deep.e2e.spec.ts` | Snapshot RPC exposes appointment counters + outcomes; UI no error boundary |

## Run

```bash
# All revenue-critical
npx playwright test --grep @revenue-critical

# Single flow
npx playwright test e2e/revenue-critical/01-lead-ingestion
```

## Required env

```
E2E_EMAIL=...
E2E_PASSWORD=...
E2E_BRAND_NAME=...
VITE_SUPABASE_URL=...
PW_BASE_URL=https://<preview>.lovable.app  # or local dev
```

## Design

These tests are **smoke-level** by design:
- They verify pages render without error boundaries
- They verify webhook endpoints reject bad input correctly
- They do NOT mutate production data (no real deals/sales created)

For deeper assertions, extend each spec with seeded test data
(see `e2e/inbound-webhooks.e2e.spec.ts` for the pattern).
