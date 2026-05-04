# Migrazioni: baseline soft + linter SQL in CI (v2)

## Obiettivi

1. Avere una **fonte di verità leggibile** dello schema (un solo file invece di 328) per code review e onboarding nuovi env.
2. Bloccare in CI le quattro classi di errore che hanno generato il caos delle 328 migrazioni:
   - DROP/ALTER pericolosi (squawk)
   - `USING (true)` / `WITH CHECK (true)` su tabelle business
   - `DROP POLICY` orfani senza `CREATE POLICY` corrispondente **per coppia (tabella, comando)**
   - DELETE/UPDATE di massa accidentali su tabelle business
3. **Zero rischio di drift**: i 328 file restano dove sono e nel registry di Lovable Cloud — il baseline è un artefatto di sola lettura.

## Cosa NON facciamo

- **Niente squash distruttivo del registry `supabase_migrations.schema_migrations`.** Lovable Cloud applica le migrazioni in coda al registry esistente; toccarlo significa rischiare la riapplicazione del baseline su un DB già popolato → perdita dati.
- **Niente cancellazione dei 328 file storici.** Vengono lasciati dove sono: la cronologia git basta.

## Cosa facciamo

### 1. Baseline snapshot (read-only)

```text
supabase/migrations/             ← 328 file invariati (Lovable li applica)
supabase/baseline/               ← path SENZA underscore iniziale (più robusto)
  ├── 20260601_baseline.sql      ← pg_dump --schema-only sanitizzato
  ├── policies-summary.md        ← lista policy attive da pg_policies
  └── README.md                  ← spiega che è solo documentazione
.supabaseignore                  ← include esplicitamente supabase/baseline/**
```

**Generazione (`scripts/security/generate-baseline.sh`):**

```bash
pg_dump \
  --schema-only --no-owner --no-privileges --no-comments \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=supabase_migrations \
  --exclude-schema=vault \
  --exclude-schema=graphql \
  --exclude-schema=graphql_public \
  --exclude-schema='pgsodium*' \
  --exclude-schema=net \
  --exclude-schema=extensions \
  --exclude-schema=cron \
  --exclude-schema=pg_catalog \
  --exclude-schema=information_schema \
  -h "$PGHOST" -U "$PGUSER" -d postgres \
  > supabase/baseline/20260601_baseline.sql
```

**Sanitizzazione post-dump (hard fail):**
- Trasforma `CREATE EXTENSION ...` → `-- managed by Supabase: CREATE EXTENSION ...`
- **Check anti-leak**: `grep -E "^INSERT INTO" baseline.sql` → se trova match su tabelle NON in whitelist (`pipeline_stages_default`, `app_role_metadata`, ecc.) → **exit 1**. Lookup table seedate sono permesse solo se elencate esplicitamente nello script.
- Rimuove riferimenti a ruoli specifici Supabase residui.

`policies-summary.md` è una vista tabellare di `pg_policies` filtrata su `schemaname='public'` — utile per audit GDPR/SOC2 e per individuare `USING (true)` superstiti.

### 2. Linter SQL in CI: 4 hard gate

Workflow `.github/workflows/sql-lint.yml` con trigger:
```yaml
paths:
  - 'supabase/migrations/**'
  - 'supabase/baseline/**'         # auto-test pipeline su modifiche al baseline
  - 'scripts/security/check-*.sh'  # auto-test sugli script stessi
  - '.github/workflows/sql-lint.yml'
```

Linta **solo i file modificati nella PR** (`git diff --name-only origin/main...HEAD -- supabase/migrations/`), no scan dei 328 storici.

Tutti i gate emettono **GitHub Annotations** (`::error file=path,line=N,col=C::message`) per evidenziare l'errore esatto inline nella PR.

#### Gate 1 — `squawk` (Postgres-aware)

Regole attive:
- `prefer-robust-stmts` — `CREATE INDEX` deve essere `CONCURRENTLY` o `IF NOT EXISTS`
- `disallowed-unique-constraint` — niente `UNIQUE` aggiunto via `ALTER TABLE` su tabella esistente
- `adding-not-null-field` — `NOT NULL` solo se c'è `DEFAULT` o la colonna è nuova
- `changing-column-type` — `ALTER COLUMN ... TYPE` richiede `USING` esplicito
- `renaming-column` / `renaming-table` — bloccati (override via `-- squawk-ignore`)

Binario installato via `actions/cache` keyed su `squawk-${VERSION}` per evitare i 30s di download a ogni run.

#### Gate 2 — Custom: `USING (true)` / `WITH CHECK (true)` su tabelle business

Script `scripts/security/check-rls-permissive.sh`. Pattern catturati (regex case-insensitive, tolerant a whitespace):

```regex
(USING|WITH\s+CHECK)\s*\(\s*(true|TRUE|1\s*=\s*1)\s*\)
```

Per ogni `CREATE POLICY ... ON <table> ... <pattern>`:

1. Estrae la clausola `TO <role>`. Se mancante (default = `public` = tutti) → **trattata come non whitelistata**.
2. Se `TO service_role` → **OK** (non blocca).
3. Altrimenti consulta whitelist hardcoded di tabelle dove il pattern è accettabile (system queue, anomaly_baselines, lookup tables — la lista esatta verrà costruita ispezionando le 16 occorrenze attuali e confermata in fase di implementazione).
4. Se `<table>` non in whitelist → **exit 1** con annotation:
   ```
   ::error file=supabase/migrations/X.sql,line=42::Policy permissiva (USING/WITH CHECK true) su tabella business 'leads'. Usa has_role_for_brand(...) o sposta a TO service_role.
   ```

#### Gate 3 — Custom: `DROP POLICY` orfano (per coppia tabella, comando)

Script `scripts/security/check-orphan-drop-policy.sh`. Logica corretta su feedback:

1. Per ogni file PR estrae tutti i `DROP POLICY "name" ON public.<table>` → registra `(table, name)`.
2. Per ogni policy droppata, recupera dal baseline (`supabase/baseline/policies-summary.md`) la coppia `(table, cmd)` originale: `cmd ∈ {SELECT, INSERT, UPDATE, DELETE, ALL}`.
3. Espande `ALL` → `{SELECT, INSERT, UPDATE, DELETE}`.
4. Per ogni file della PR estrae `CREATE POLICY ... ON public.<table> FOR <cmd>` → registra coperture per `(table, cmd)`. Anche qui `FOR ALL` espande a 4.
5. **Coperture mancanti = errore.** Esempio del feedback: drop di `policy_select` (FOR SELECT) e `policy_update` (FOR UPDATE), ricreazione di solo `policy_select` → manca UPDATE → exit 1.
6. Drop di una `FOR ALL` ricreato con solo `FOR SELECT` → mancano INSERT/UPDATE/DELETE → exit 1.
7. Override esplicito: commento sulla riga del DROP `-- intentional-drop-policy: <reason>` salta quella specifica coppia.

Annotation: `::error file=X.sql,line=N::Tabella 'leads' resta senza policy per UPDATE dopo DROP POLICY 'leads_update_v1'`.

#### Gate 4 — Custom: data-safety hard rule (mass DELETE/UPDATE su tabelle business)

Script `scripts/security/check-business-table-mutations.sh`.

**Lista tabelle protette** (estesa rispetto a v1 su feedback — include satellite sensibili):

```
appointments, contacts, leads, deals,
contact_phones, contact_emails, contact_tracking,
custom_fields, custom_field_values,
audit_events, audit_log, lead_events, meta_lead_events,
pipeline_stages, pipeline_stage_transitions, deal_stage_transitions,
webhook_request_dedup, incoming_requests,
payments, tickets, ticket_messages
```
(la lista finale viene confermata leggendo lo schema corrente, ma questi sono il minimo).

**Pattern bloccati:**

| Pattern | Esempio bloccato |
|---|---|
| `DROP TABLE public.<protected>` | `DROP TABLE public.appointments` |
| `DROP COLUMN` su tabella protetta | `ALTER TABLE public.contact_tracking DROP COLUMN utm_source` |
| `TRUNCATE [TABLE] public.<protected>` | `TRUNCATE TABLE public.leads` |
| `DELETE FROM public.<protected>` senza `WHERE` o con `WHERE` generico | `DELETE FROM public.contacts`, `... WHERE true`, `... WHERE 1=1` |
| `DELETE FROM public.<protected> USING ...` | qualunque variante con USING (lock pesante, hard fail) |
| `WITH ... DELETE FROM public.<protected>` | CTE-based mass delete |
| `UPDATE public.<protected> SET ...` senza `WHERE` o con `WHERE` generico | `UPDATE contacts SET deleted_at = now()` (soft-delete di massa) |

**Filtro "WHERE generico"**: `WHERE` seguito da `true`, `1=1`, `id IS NOT NULL`, oppure subquery che selezionano tutto (`WHERE id IN (SELECT id FROM <stessa_tabella>)`).

**Override**: solo via modifica esplicita dello script (= seconda PR). Documentato in `docs/migrations-policy.md`:

> Per disabilitare il check su una specifica migrazione, serve una PR separata che aggiunga il file path alla `EXEMPTION_LIST` dello script. Approvazione richiesta: **2 reviewer**, di cui uno tech lead e uno con responsabilità security/compliance. La PR di esenzione e la migrazione effettiva NON possono essere mergiate dallo stesso autore.

### 3. Smoke test schema (job aggiuntivo, opzionale ma alto ROI)

Job `migrations-replay` nello stesso workflow, parte solo se la PR tocca `supabase/migrations/**`:

```yaml
- run: |
    docker run -d --name pg -e POSTGRES_PASSWORD=test -p 54322:5432 supabase/postgres:15
    until pg_isready -h localhost -p 54322; do sleep 1; done
    for f in supabase/migrations/*.sql; do
      psql "postgresql://postgres:test@localhost:54322/postgres" -f "$f" || exit 1
    done
```

Tempo atteso: 60-90s. Cattura il bug "una nuova migrazione referenzia una tabella droppata 3 migrazioni prima" che squawk non vede.

Marcato come `continue-on-error: false` ma `if: contains(github.event.pull_request.labels.*.name, 'skip-migration-replay') == false` per emergency skip.

### 4. Auto-rigenerazione baseline (job schedulato)

Workflow separato `.github/workflows/baseline-refresh.yml`:

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'  # lunedì 6:00 UTC
  workflow_dispatch:
```

Esegue `generate-baseline.sh` su preview, fa `git diff supabase/baseline/` e apre una PR automatica se differisce, etichettata `baseline-drift`. Reviewer = team admin.

### 5. Documentazione

- `docs/migrations-policy.md` — spiega le 4 regole, override legittimi, processo a 2 reviewer per Gate 4.
- `mem://architecture/migration-governance.md` — sintesi per future AI session.
- Voce in `mem://index.md`.

## File toccati / creati

```text
supabase/baseline/20260601_baseline.sql           [NEW — ~1.4 MB pg_dump sanitizzato]
supabase/baseline/policies-summary.md             [NEW — auto-generato]
supabase/baseline/README.md                       [NEW]
.supabaseignore                                   [NEW o EDIT]
scripts/security/generate-baseline.sh             [NEW]
scripts/security/check-rls-permissive.sh          [NEW]
scripts/security/check-orphan-drop-policy.sh      [NEW]
scripts/security/check-business-table-mutations.sh[NEW]
.github/workflows/sql-lint.yml                    [NEW]
.github/workflows/baseline-refresh.yml            [NEW]
docs/migrations-policy.md                         [NEW]
mem://architecture/migration-governance.md        [NEW]
mem://index.md                                    [EDIT — aggiungo riga]
```

**Zero modifiche a `supabase/migrations/*` esistenti. Zero modifiche al DB.**

## Rollout (3 PR)

| PR | Cosa | Mode |
|---|---|---|
| **PR 1** | Baseline + script `generate-baseline.sh` + docs | — |
| **PR 2** | 4 gate + workflow `sql-lint.yml` + smoke replay + baseline-refresh | **Warning** (exit 0 + annotation) |
| **PR 3** | Switch a hard gate (exit 1) dopo 1 settimana di osservazione + revisione delle 16 `USING(true)` con conferma whitelist | **Hard** |

## Note tecniche

- `squawk` installato via `actions/cache` keyed su versione → ~3s warm cache invece di 30s.
- `generate-baseline.sh` richiede `PGHOST/PGUSER/PGPASSWORD` con sola **read** sullo schema `public` su preview (segret CI dedicato `BASELINE_DB_*`, mai produzione).
- Script Gate 2/3/4 = `bash + grep -P` puro, zero dipendenze esterne (segue il pattern di `check-env-files.sh`).
- Tutti gli script supportano `--check-file <path>` per debug locale (`scripts/security/check-rls-permissive.sh --check-file supabase/migrations/foo.sql`).
