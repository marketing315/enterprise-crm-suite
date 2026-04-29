# Revenue-Critical CI Integration

## Where it runs

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `e2e-gate.yml` | Every PR + push to main | **Hard gate**: blocks merge if `@revenue-critical` fails |
| `revenue-critical.yml` | PR (scoped paths) + 6h schedule + manual | Fast feedback + drift detection on live preview |
| `e2e-nightly.yml` | Nightly 02:00 UTC | Full suite (includes revenue-critical) |

## Required GitHub Secrets

| Secret | Used by | Notes |
|--------|---------|-------|
| `E2E_EMAIL` | both | Test user with brand access |
| `E2E_PASSWORD` | both | |
| `E2E_BRAND_NAME` | both | Must match a brand the test user can select |
| `VITE_SUPABASE_URL` | both | Used by lead-ingest + MCP-server tests |
| `PW_BASE_URL` | both | Preview URL (skip if local) |
| `DATABASE_URL` | gate only | For seeding fixtures |
| `SLACK_WEBHOOK_URL` | revenue-critical only | Optional — alerts on scheduled failures |

## Local reproduction

```bash
# Same env as CI
export E2E_EMAIL=...
export E2E_PASSWORD=...
export E2E_BRAND_NAME=...
export VITE_SUPABASE_URL=https://qmqcjtmcxfqahhubpaea.supabase.co
export PW_BASE_URL=https://ralph-hub.lovable.app

npx playwright test --grep @revenue-critical
```

## Adding a new revenue-critical flow

1. Create `e2e/revenue-critical/0X-<flow-name>.e2e.spec.ts`
2. Tag tests with `@revenue-critical` in the `describe` block
3. Update `e2e/revenue-critical/README.md` with the new flow
4. No CI change needed — `--grep @revenue-critical` picks it up automatically

## Failure policy

- **PR fails** → fix before merge. No exceptions.
- **Scheduled run fails** → Slack alert → triage within 1h (data drift, RLS regression, edge function down).
- **Flaky test** → fix or remove. Never use `test.fixme`/`test.skip` to silence.
