# Admin Runbook

Guida operativa rapida per amministratori della piattaforma. Per dettagli architetturali consulta i documenti in `docs/`.

## 1. Accessi & secrets

- I secrets dell'app sono gestiti via **Cloud → Connectors / Secrets**. Mai committare chiavi in repo (`scripts/security/check-env-files.sh` blocca i `.env*` non whitelistati).
- Rotazione chiavi: vedi `docs/oauth-channels.md` e `docs/voispeed-integration.md`.
- API key Lovable AI: rotazione dal pannello Cloud → AI Gateway.

## 2. Dashboard amministrative

| Path | Scopo |
|------|-------|
| `/admin/observability` | SLO, RED metrics, traces, dependency SBOM |
| `/admin/slo-board` | Burn rate alert + budget rimanente |
| `/admin/slow-queries` | Top query per tempo medio (`pg_stat_statements`) |
| `/admin/cron-jobs` | Cron registry, drift, run log |
| `/admin/sheets-health` | Stato pipeline lead → Google Sheet (SLO 15min) |
| `/admin/incidents` | Errori client riportati da `ErrorBoundary` |
| `/admin/sessions` | Sessioni attive + revoca remota |
| `/admin/audit` | Audit log unificato (hash chain) |
| `/admin/contacts-dedup` | Merge contatti duplicati |
| `/admin/data-quality` | Metriche qualità dati per brand |
| `/admin/quick-backup` | Backup manuale + ripristino |
| `/admin/changelog` | Storico release |

## 3. Procedure di emergenza

### Pipeline lead bloccata (Sheet/Meta CAPI/n8n)
1. `/admin/sheets-health`: verifica trigger e ultimo export.
2. Se trigger drop, lancia `SELECT verify_critical_triggers();` (auto-recreate da `critical_triggers_registry`).
3. Reconciliation manuale: tasto "Backfill 7gg" sulla dashboard.

### Webhook esterno in degrado
1. `/admin/webhooks` → metric 24h.
2. Se >5% KO: `/admin/dlq` per replay puntuale.
3. Circuit breaker: tabella `circuit_breaker_state` (lead-digest, sheets-export). Reset manuale via `cb_record_outcome(..., success)`.

### Backup / DR
- Drill scripts: `scripts/dr/drill-pitr-validation.sh`, `drill-dlq-replay.sh`, `drill-edge-failover.sh`.
- Game-day post-mortem: `docs/dr/game-day-2026-05-05.md`.
- Backup off-site: doppia copia Lovable Storage + Google Drive. Vedi mem `backup-google-drive-offsite`.

### Sospetto compromissione account
1. `/admin/sessions`: revoca tutte le sessioni dell'utente.
2. Forzare reset password + verifica MFA (admin/CEO devono averla, vedi mem `mfa-admin-ceo`).
3. `/admin/audit` filtrato per `user_id` per timeline azioni.

## 4. Race conditions (Sprint 4)

- `move_deal_stage(deal, stage, expected_version)` solleva `STALE_DEAL` se la versione client è obsoleta → la UI fa rollback automatico. Idem `assign_ticket` con `STALE_TICKET`.
- SLA breach dedup via `FOR UPDATE SKIP LOCKED` in `check_and_mark_sla_breaches`.

## 5. Performance

- Slow queries → `/admin/slow-queries`. Reset statistiche: bottone "Reset" (audit-loggato).
- Indici hot path verificati in snapshot 2026-05-07: `idx_deals_brand_id`, `idx_tickets_brand_assignee_status_opened`, `idx_tickets_sla_breach`. Aggiungere nuovi indici **solo** dietro evidenza dalla dashboard.
- Cloud compute: se l'app è lenta sotto carico, valutare upgrade istanza Cloud (Backend → Advanced settings → Upgrade instance).

## 5.bis Capacity & retention (ADR-001)

- **Mensile (15 min)**: trend `db_size_history`. Se pendenza > 5%/mese → indaga. Verifica cron `cleanup-*` con `SELECT jobname, active FROM cron.job WHERE jobname LIKE 'cleanup-%' OR jobname='track-db-growth';`.
- **Trimestrale (30 min)**: re-run audit retroattivo (vedi `docs/db-retention-policy.md` §Audit). Tabelle nuove `NO CLEANUP` → ticket `retention-review`.
- **Annuale**: DR drill "disco pieno" → `docs/dr/04-disk-full.md`.
- Soglie alert (view `v_db_growth_alerts`): CRITICAL > 6 GB (75% di 8 GB), WARNING crescita > 1 GB/giorno.

## 6. Convenzioni di sviluppo da rispettare

- Migrazioni puramente additive su tabelle business (vedi Core memory "Data Safety").
- RPC SECURITY DEFINER: sempre `search_path = public` esplicito + `REVOKE FROM PUBLIC,anon`.
- Frontend list pages: usare `<TableSkeleton />` + `<EmptyState />` + `useMutationFeedback` (Sprint 6).
- Mai `dangerouslySetInnerHTML` con contenuto utente/AI: usare `SafeMarkdown`.

## 7. Contatti

- On-call rotation: vedi `.github/CODEOWNERS`.
- Escalation: tech lead → CEO. Tutti gli incidenti P1 generano automaticamente entry su `/admin/incidents`.
