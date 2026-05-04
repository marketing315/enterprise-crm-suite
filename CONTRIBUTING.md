# Contributing

This repo is the Lovable-managed CRM for Gruppo Benessere. Lovable owns the
bidirectional sync with `main`, but human contributors still ship via standard
GitHub PRs. The rules below describe what the repo expects from a PR and what
GitHub branch protection MUST enforce on `main`.

## Required GitHub branch protection on `main`

Configure these in **Settings → Branches → Add rule** for `main`. Lovable runs
its own pre-merge checks but cannot enforce branch protection itself; the repo
admin must turn these on once and keep them on.

### Required pull request reviews

- **Require a pull request before merging:** ON
- **Require approvals:** **1** (raise to 2 once we have ≥3 reviewers per CODEOWNER team)
- **Dismiss stale pull request approvals when new commits are pushed:** ON
- **Require review from Code Owners:** **ON** — `.github/CODEOWNERS` is the source of truth
- **Restrict who can dismiss reviews:** ON, limit to `@ralph-admins`
- **Allow specified actors to bypass required pull requests:** **OFF**
  - Even Lovable's sync MUST go through PRs once the GitHub Branch Switching lab
    feature is enabled (Account Settings → Labs).

### Required status checks

Mark all of these as **Required** before merging. Each must come from the most
recent commit (enable "Require branches to be up to date before merging").

| Check | Workflow file | Why |
|---|---|---|
| `code-hygiene / hygiene` | `.github/workflows/code-hygiene.yml` | Inline audit codes, edge-fn config, strict baseline, types drift, env files |
| `dependency-audit / audit` | `.github/workflows/dependency-audit.yml` | High/critical npm vulnerabilities |
| `secrets-scan / scan` | `.github/workflows/secrets-scan.yml` | Block leaked credentials |
| `e2e-revenue-critical / e2e` | (existing E2E workflow) | The 5 smoke + 3 deep revenue paths |
| `rbac-rls-audit / audit` | (existing RBAC workflow) | Parity between RoleGuard routes and DB RLS |

If you add a new required workflow, also list it here AND in `code-hygiene.yml`'s
job summary so reviewers know it's enforced.

### Other protections

- **Require signed commits:** ON (Lovable bot's GPG key is enrolled — coordinate before changing)
- **Require linear history:** ON — squash or rebase merges only, no merge commits
- **Require deployments to succeed before merging:** OFF (Lovable preview is always-on)
- **Lock branch:** OFF
- **Do not allow bypassing the above settings:** **ON** — applies to admins too
- **Restrict who can push to matching branches:** ON, allow only the Lovable bot account
- **Allow force pushes:** **OFF**
- **Allow deletions:** **OFF**

### Tag protection

Add a tag protection rule for `v*` and `release-*` so only `@ralph-admins` and
the Lovable bot can create or move release tags.

## PR checklist (also copy into `.github/pull_request_template.md` if/when adopted)

- [ ] Title prefixed with the touched domain (`pipeline:`, `tickets:`, `appointments:`,
      `marketing:`, `mcp:`, `ops:`, `chore:`, `docs:`, `security:`)
- [ ] Linked to the relevant issue / Notion ticket
- [ ] If the change touches `supabase/migrations/` — squawk + RLS audit run locally
- [ ] If the change touches `supabase/functions/` — `deno test` for the function passes
- [ ] If the change touches `src/components/ui/` — verified in light AND dark mode
- [ ] If the change touches a chart — `browser--screenshot` of before/after attached
- [ ] No new `// Bxx fix:` / `SECURITY [Bxx]:` inline comments (see `docs/audit-history.md`)
- [ ] No `Record<string, unknown>` passed to `.update()` — use `Tables<"x">["Update"]`
- [ ] Memory updated (`mem://...`) if this PR introduces a new architectural rule

## Code review expectations for CODEOWNERS

Every team listed in `.github/CODEOWNERS` is expected to:

1. Acknowledge a review request within **1 business day**
2. Block merge for any change that:
   - Bypasses RLS on a business table
   - Bumps a HARD-pinned dep (`@tanstack/react-query@^5.90.22`) without coordinated PR
   - Adds a required field to an existing public webhook payload
   - Drops or truncates data from a business table without explicit user approval
3. Defer to `@ralph-security` on anything matching `supabase/functions/{webhook-ingest,mcp-server,admin-*}/`
4. Defer to `@ralph-platform` on anything matching `.github/workflows/`, `scripts/security/`,
   `package.json`, `tsconfig*`, `vite.config.ts`

## Local development

See `README.md` for setup. Use `npm` (never `bun` or `yarn`) — `engine-strict=true`
is enforced and the lockfile is `package-lock.json` only.
