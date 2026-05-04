# Dependency Upgrade Backlog

Tracked manually; CI dependency audit (`.github/workflows/dependency-audit.yml`) reports
weekly outdated/vulnerable packages. This file is the human-curated upgrade plan with
scope and risk for each non-trivial bump.

## Major upgrades planned

### `recharts` 2.15.4 → 3.x

- **Status:** planned, not started
- **Impact:** 22 files import from `recharts` (CEO/Sales/Marketing dashboards, KPI cards,
  funnel/forecast charts).
- **Why:** Recharts 3 fixes long-standing `ResponsiveContainer` resize bugs (intermittent
  width=0 on dashboard tab switches) and ships a smaller bundle.
- **Breaking changes to verify:**
  - `<ResponsiveContainer>` defaults and `aspect` prop behaviour
  - `Tooltip` content API (custom tooltips will need re-typing)
  - Removal of legacy `defaultProps` warnings in React 18 strict mode
- **Plan:**
  1. Branch `chore/recharts-3-bump` — bump only `recharts`, run `tsc` and visual QA on
     every dashboard page (CEO, Sales*, Callcenter*, Marketing*, AdminAIMetrics, Forecast).
  2. Snapshot screenshots of charts before/after via `browser--screenshot`.
  3. Merge only if zero TS errors, no chart visually regresses, bundle size delta < +50KB.
- **Owner:** unassigned
- **Blocker:** none — schedule when there is QA capacity.

## Up-to-date (verified)

| Package | Installed | Latest | Notes |
|---|---|---|---|
| `cmdk` | `^1.1.1` | `1.1.1` | Already latest. No action. |
| `@tanstack/react-query` | `^5.90.22` | pinned | HARD-pinned per supply-chain memory; do not bump unguarded. |

## CI coverage

- **`.github/workflows/dependency-audit.yml`** — weekly (Mon 06:00 UTC) + on PRs touching
  `package.json` / `package-lock.json`. Hard-fails on `high`/`critical` vulns in production
  deps; soft report for everything else and `npm outdated`.
- **Why scheduled, not on every PR:** sandbox npm registry mirror does not expose the audit
  endpoint, so `npm audit` only runs in GitHub Actions against the public registry.
