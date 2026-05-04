# `supabase/baseline/` — schema snapshot (read-only)

Questa cartella contiene una **fotografia leggibile** dello schema `public` del
database Lovable Cloud. Serve a tre scopi:

1. **Code review onboarding** — un solo file da leggere invece di 320+
   migrazioni per capire come è strutturato lo schema oggi.
2. **Audit GDPR / SOC2** — `policies-summary.md` mostra a colpo d'occhio
   tutte le RLS policy attive, con evidenza delle policy permissive
   (`USING (true)` / `WITH CHECK (true)`).
3. **Mappa per il linter SQL in CI** — Gate 3 (`check-orphan-drop-policy.sh`)
   consulta `policies-summary.md` per espandere `FOR ALL` in
   `{SELECT, INSERT, UPDATE, DELETE}` e verificare che ogni `DROP POLICY`
   abbia una `CREATE POLICY` corrispondente per la stessa coppia
   `(tabella, comando)`.

## ⚠️ Cosa NON è questa cartella

- **Non è una migrazione.** Il file `20260601_baseline.sql` è escluso dal CLI
  Supabase via `.supabaseignore`. Lovable Cloud applica esclusivamente i file
  in `supabase/migrations/`.
- **Non sostituisce il registry `supabase_migrations.schema_migrations`.**
  Le 320+ migrazioni storiche restano in `supabase/migrations/` e nel registry.
  Toccare il registry per "squashare" rischierebbe di riapplicare il baseline
  su DB già popolato → perdita dati. **Non farlo.**
- **Non contiene dati.** Il dump è `--schema-only`. La generazione fallisce in
  hard-fail se trova `INSERT` non in whitelist.

## File in cartella

| File | Cos'è | Generazione |
|---|---|---|
| `20260601_baseline.sql` | `pg_dump --schema-only` dello schema `public` | `scripts/security/generate-baseline.sh` |
| `policies-summary.md` | Vista tabellare di `pg_policies` filtrata su `public` | idem |
| `README.md` | Questo file | manuale |

## Aggiornamento

**Automatico:** workflow `.github/workflows/baseline-refresh.yml` gira ogni
lunedì alle 06:00 UTC, ri-genera baseline + summary, e apre una PR
etichettata `baseline-drift` se differiscono.

**Manuale (locale):**
```bash
# Richiede PGHOST / PGUSER / PGPASSWORD verso DB preview (mai produzione).
./scripts/security/generate-baseline.sh
```

## Esclusioni del dump

Il baseline include **solo lo schema `public`**. Schema esclusi:

- `auth`, `storage`, `realtime`, `vault` — gestiti da Supabase
- `supabase_migrations` — registry interno, mai versionarlo
- `graphql`, `graphql_public` — auto-generati
- `pgsodium*` — vault interno
- `net`, `extensions`, `cron` — extension-managed
- `pg_catalog`, `information_schema` — system catalogs

Privileges e owner non sono inclusi (`--no-privileges --no-owner`) — sono
gestiti da RLS policy e service_role di Supabase, non da `GRANT` espliciti.

## Anti-leak

Lo script di generazione fallisce con exit 1 se trova `INSERT INTO` per
tabelle non in whitelist. Whitelist attuale (lookup table seedate):

- _(nessuna — il baseline corrente non contiene seed data)_

Per aggiungere una lookup table seedata legittima, modificare la variabile
`SEED_WHITELIST` in `scripts/security/generate-baseline.sh` con la motivazione
nel commit message.
