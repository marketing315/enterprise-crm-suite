# Soft-delete inventory (H4)

Tabelle PII con colonne soft-delete che DEVONO avere il filtro a livello RLS SELECT.

| Tabella | Colonna soft-delete | Predicato richiesto in policy SELECT |
|---|---|---|
| `contacts` | `merged_into_contact_id` (uuid) | `merged_into_contact_id IS NULL` |
| `lead_events` | `archived` (bool) | `archived = false` |
| `tickets` | `archived` (bool), `archived_at` (tstz) | `archived = false AND archived_at IS NULL` |
| `chat_threads` | `archived_at` (tstz) | `archived_at IS NULL` |
| `chat_messages` | `deleted_at` (tstz) | `deleted_at IS NULL` |

Tabelle escluse:
- `audit_events_archive` — accesso ristretto a `is_audit_admin()`, soft-delete non applicabile (è già un archivio).

## Override admin/CEO

Tutte le policy ammettono override per `admin` di brand o `ceo` globale, così che la console amministrativa possa vedere anche i record archiviati / mergiati.

## Gate CI

`scripts/ci/check-soft-delete-rls.sh` rilegge `pg_policies` e fallisce se una di queste tabelle ha policy `SELECT` senza il predicato corrispondente.

## Test pgTAP

`scripts/tests/h4-soft-delete-rls-e2e.sql` verifica end-to-end che un utente non-admin NON veda i record con flag soft-delete impostato.
