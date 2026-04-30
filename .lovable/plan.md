# Backup rapido del database (on-demand)

Aggiunta di un sistema "Quick Backup" per generare snapshot logici delle tabelle business critiche, scaricabili istantaneamente. Complementa il PITR (`docs/dr/02-pitr-restore.md`) — il PITR resta lo strumento per recovery; questo serve per **export rapido**, audit, migrazioni e safety net prima di operazioni rischiose.

## Cosa costruisco

### 1. Edge Function `quick-backup-runner`
- Riceve `{ brand_id, scope }` dove `scope ∈ {minimal, standard, full}`.
- Whitelist hard-coded di tabelle (no SQL arbitrario, no DROP/DELETE — solo SELECT).
  - **minimal**: `contacts`, `contact_phones`, `contact_emails`, `deals`, `appointments`
  - **standard**: minimal + `lead_events`, `audit_events`, `appointment_outcomes`, `contact_field_values`, `deal_stage_history`
  - **full**: standard + `notifications`, `tickets`, `ticket_events`, `ai_decision_logs`, `lead_scores`
- Per ogni tabella: `SELECT * WHERE brand_id = ? LIMIT 50000`, serializza JSONL, comprime con `gzip` (CompressionStream).
- Bundle finale: archivio `tar.gz` con `manifest.json` (timestamp, brand, conteggi per tabella, checksum SHA-256 per file).
- Permission gate: solo `admin`/`ceo` sul brand. RPC `assert_can_backup_brand` lato DB.
- Output: chunk binario direttamente nella response (no storage intermedio per scope minimal/standard, < 20 MB).

### 2. Tabella `backup_runs` (audit + storico)
- Campi: `brand_id`, `scope`, `triggered_by_user_id`, `tables_included[]`, `total_rows`, `size_bytes`, `duration_ms`, `status` (`running`/`completed`/`failed`), `error`, `checksum`.
- RLS: admin/CEO read sul brand; insert solo via service role (edge function).
- **Niente** storage del backup stesso lato DB — solo metadati. Il blob viene streamato all'utente.

### 3. Pagina `/admin/quick-backup`
- Scelta scope (radio con conteggio righe stimato per scope).
- Pulsante "Genera backup" → POST a edge function, mostra progress, scarica `.tar.gz`.
- Tabella storico ultimi 50 backup del brand: data, scope, righe, dimensione, durata, chi.
- RoleGuard: `admin`, `ceo`.

### 4. Voce in Settings Navigation
Aggiungo link "Backup rapido" nel gruppo Amministrazione (`adminOnly: true`).

## Cosa NON costruisco (esplicito)

- **Schema/DDL dump**: già fornito dal sistema migrations Supabase.
- **Restore automatico**: rischioso — il backup è solo per consultazione/export. Per restore vero → PITR runbook esistente.
- **Backup ricorrenti automatici**: PITR continuo già copre. Si può aggiungere dopo se serve.
- **Backup cross-brand "tutto"**: limitato per-brand per evitare timeout edge function (CPU 60s / memoria 256 MB).

## Dettagli tecnici

### Files
- `supabase/functions/quick-backup-runner/index.ts` — runner principale con CompressionStream + tar in-memory.
- `supabase/migrations/...sql` — tabella `backup_runs` + RPC `start_backup_run` / `complete_backup_run` + `assert_can_backup_brand`.
- `src/pages/AdminQuickBackup.tsx` — UI scope picker + storico.
- `src/hooks/useQuickBackup.ts` — mutation che invoca edge function via `supabase.functions.invoke({ responseType: 'blob' })` e triggera download.
- `src/App.tsx` — route `/admin/quick-backup` (admin/ceo).
- `src/components/settings/SettingsNavigation.tsx` (o equivalente) — aggiunge voce.

### Sicurezza
- Edge function legge `brand_id` dal JWT-validato `get_user_id(auth.uid())` e verifica role via RPC.
- Whitelist tabelle compilata nel codice (impossibile passare nomi tabella arbitrari).
- Limit hard 50k righe per tabella → log warning se raggiunto, marca `truncated: true` nel manifest.
- Audit: ogni run scritto in `backup_runs` + `audit_events` (action `backup.export`).

### Performance
- Tabelle attuali max ~15k righe → tempo stimato < 10s anche per scope `full`.
- Streaming compression: nessun spike di memoria, scrive direttamente nello stream di response.

### Compatibilità data-safety
- Operazioni esclusivamente di lettura. Nessun DROP/ALTER. Nessun cambio a tabelle business. Conforme al constraint `appointments-data-safety`.

## Memoria
Aggiungo `mem://features/quick-backup-system` con whitelist tabelle, limiti e flusso.
