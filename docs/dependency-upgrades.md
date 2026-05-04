# Dependency Upgrade Backlog

Tracked manually; CI dependency audit (`.github/workflows/dependency-audit.yml`) reports
weekly outdated/vulnerable packages. This file is the human-curated upgrade plan with
scope and risk for each non-trivial bump.

## Major upgrades planned

### `recharts` 2.15.4 → 3.x

- **Status:** attempted 2026-05-04, **rolled back**
- **Outcome:** `recharts@3.8.1` installed cleanly and 22 consumer files compiled, BUT the
  npm transitive resolution also bumped `@supabase/supabase-js` from `2.91.1` → `2.105.1`,
  which tightened the `RejectExcessProperties` constraint on `.update()` and broke 9 hooks
  that pass `Record<string, unknown>` payloads (`useAIConfig`, `useAutomationRules`,
  `useBrandSettings`, `useCampaignGroups`, `useCustomFields`, `useMcpData`,
  `useTicketBulkActions`, `useTickets`). Additionally, `chart.tsx` (shadcn wrapper) and
  `CompanyOverview.tsx` `Pie.label` callback need rewriting for the v3 Tooltip/Legend
  generics. Reverted to `recharts@^2.15.4` + `@supabase/supabase-js@2.91.1`.
- **Plan v2:** open dedicated PR `chore/recharts-3-bump` that ALSO:
  1. Pins `@supabase/supabase-js` explicitly so the bump is intentional, not transitive.
  2. Tightens the 9 hooks to typed `Tables<"...">["Update"]` payloads instead of
     `Record<string, unknown>`.
  3. Rewrites `ChartTooltipContent` / `ChartLegendContent` against v3 `TooltipProps` and
     `LegendProps` generics.
  4. Rewrites `Pie.label` callback in `CompanyOverview.tsx` (v3 `PieLabelRenderProps` no
     longer spreads custom data keys).
  5. Visual QA via `browser--screenshot` on every dashboard page.
- **Owner:** unassigned
- **Blocker:** needs QA capacity AND the supabase-js+hook typing refactor as prerequisite.

### `react-day-picker` 8.10.1 → 9.x

- **Status:** attempted 2026-05-04, **rolled back** (bundled with the recharts revert).
- **Outcome:** v9 renames `classNames` keys (`head_cell`→`weekday`, `day_*`→`selected/today/outside/disabled`,
  `nav_button_*`→`button_previous/next`, `caption`→`month_caption`, `table`→`month_grid`,
  `head_row`→`weekdays`, `row`→`week`) and replaces `IconLeft/IconRight` with the generic
  `Chevron` slot. Wrapper rewrite is straightforward; deferred to keep this hygiene PR small.
- **Plan:** standalone PR `chore/react-day-picker-9-bump` — only edits `src/components/ui/calendar.tsx`,
  visual QA on the 11 call sites that import it.
- **Owner:** unassigned

### `@dnd-kit/*` (no upgrade needed)

- `@dnd-kit/core@6.3.1` and `@dnd-kit/sortable@10.0.0` are the **latest stable** versions on
  npm (verified 2026-05-04 via `npm view`). There is no v7/v11 to bump to. The hygiene
  ticket "L4 dnd-kit legacy" is **not actionable**; closed as no-op.


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
