# Politica delle migrazioni SQL

> **Stato:** PR 1 in corso — solo baseline soft + script di generazione.
> Le 4 regole hard-gate (PR 2/3) verranno aggiunte in CI in seguito.

## Filosofia

Le 320+ migrazioni storiche restano dove sono (`supabase/migrations/`) e non
vengono toccate. Squash distruttivo del registry è **vietato** (vedi
[`mem://constraint/appointments-data-safety`](mem://constraint/appointments-data-safety)).

L'approccio è **aggressivo nelle regole, conservativo nei dati**:

- Documentiamo lo schema corrente in un baseline leggibile (`supabase/baseline/`).
- Linter SQL in CI sui **soli file modificati** nella PR — i 320 storici sono off-limits.
- Mai eliminazioni di dati senza approvazione esplicita (Gate 4).

## File chiave

| Path | Cosa | Auto-gen |
|---|---|---|
| `supabase/migrations/*.sql` | Migrazioni reali, applicate da Lovable Cloud | No |
| `supabase/baseline/20260601_baseline.sql` | Snapshot pg_dump dello schema `public` | Sì |
| `supabase/baseline/policies-summary.md` | Vista tabellare di `pg_policies` | Sì |
| `.supabaseignore` | Esclude `supabase/baseline/` dal CLI | No |
| `scripts/security/generate-baseline.sh` | Rigenera baseline + summary | — |

## Le 4 regole (in arrivo nelle PR 2/3)

### Gate 1 — `squawk` (Postgres-aware)

Bloccato:
- `CREATE INDEX` senza `CONCURRENTLY` o `IF NOT EXISTS`
- `ALTER COLUMN ... TYPE` senza `USING`
- `NOT NULL` su tabella esistente senza `DEFAULT`
- `RENAME COLUMN/TABLE` (override via `-- squawk-ignore`)

### Gate 2 — `USING (true)` / `WITH CHECK (true)` su tabelle business

Pattern `(USING|WITH CHECK)\s*\(\s*(true|TRUE|1\s*=\s*1)\s*\)` rilevato.

- `TO service_role` → OK (sempre).
- Tabella in whitelist hardcoded → OK.
- Altrimenti → exit 1.

**Stato baseline:** la whitelist nasce **vuota**. Snapshot al
2026-05-04: 23 policy permissive, **tutte** a `service_role` → zero falsi
positivi attesi quando il gate diventa hard.

### Gate 3 — `DROP POLICY` orfano (per coppia `(table, command)`)

Per ogni `DROP POLICY "X" ON public.<tab>` nella PR:
1. Recupera `cmd` originale da `policies-summary.md`.
2. Espande `ALL` → `{SELECT, INSERT, UPDATE, DELETE}`.
3. Verifica che esista una `CREATE POLICY ... ON public.<tab> FOR <cmd>` nella stessa PR.
4. Coperture mancanti → exit 1 con annotation puntuale.

Override sulla riga del DROP: `-- intentional-drop-policy: <reason>`.

### Gate 4 — Data-safety (mass DELETE/UPDATE su tabelle business)

Tabelle protette (lista minima):

```
appointments, contacts, leads, deals,
contact_phones, contact_emails, contact_tracking,
custom_fields, custom_field_values,
audit_events, audit_log, lead_events, meta_lead_events,
pipeline_stages, pipeline_stage_transitions, deal_stage_transitions,
webhook_request_dedup, incoming_requests,
payments, tickets, ticket_messages
```

Pattern bloccati:
- `DROP TABLE` / `DROP COLUMN` su tabella protetta
- `TRUNCATE` su tabella protetta
- `DELETE FROM` senza `WHERE` o con `WHERE` generico (`true`, `1=1`, `id IS NOT NULL`, `id IN (SELECT id FROM <stessa>)`)
- `UPDATE` senza `WHERE` o con `WHERE` generico (soft-delete di massa)
- `WITH ... DELETE FROM` su tabella protetta (CTE-based mass delete)

**Override Gate 4 — processo a 2 reviewer:**

> Per disabilitare il check su una specifica migrazione, serve una **PR
> separata** che aggiunga il file path alla `EXEMPTION_LIST` dello script.
> Approvazione richiesta: **2 reviewer**, di cui uno tech lead e uno con
> responsabilità security/compliance. La PR di esenzione e la migrazione
> effettiva **NON possono essere mergiate dallo stesso autore**.

## Aggiornamento baseline

- **Automatico:** `.github/workflows/baseline-refresh.yml` ogni lunedì 06:00 UTC.
  Apre PR etichettata `baseline-drift` se il dump differisce.
- **Manuale:** `./scripts/security/generate-baseline.sh` con env `PGHOST/PGUSER/PGPASSWORD`
  verso preview (mai produzione).

## Smoke test schema replay

Job `migrations-replay` (in arrivo PR 2): docker `supabase/postgres:15`,
applica in ordine tutti i file in `supabase/migrations/`. Tempo atteso: 60-90s.
Cattura il bug "una migrazione referenzia una tabella droppata 3 migrazioni
prima" che squawk non vede.

Skip emergenziale: label PR `skip-migration-replay`.

## FAQ

**Q: Posso modificare a mano `supabase/baseline/20260601_baseline.sql`?**
No. Verrà sovrascritto al prossimo refresh. Per cambiare lo schema:
crea una migrazione in `supabase/migrations/`.

**Q: Cosa succede se il baseline diverge dal DB reale?**
Il workflow di refresh apre una PR `baseline-drift`. Va revisionata: se il
diff è atteso (= migrazioni applicate dall'ultimo refresh), si mergia. Se è
inatteso → indagine (modifica manuale al DB? hot-fix non versionato?).

**Q: Devo squashare le 320 migrazioni storiche?**
No. Sono il registry. Toccarle rischierebbe drift fra env e perdita dati. Il
baseline soft risolve il problema "leggibilità" senza toccare il registry.
