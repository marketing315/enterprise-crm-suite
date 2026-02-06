

# Fix Foreign Key Mismatch su `contact_table_views`

## Problema

La colonna `owner_user_id` ha un vincolo FK verso `auth.users(id)`, ma il codice frontend inserisce il valore `user.id` proveniente dalla tabella `public.users`. Questi due UUID sono diversi:

```text
public.users.id          --> UUID interno app (es. abc-123)
public.users.supabase_auth_id --> UUID di auth.users (es. xyz-789)

INSERT owner_user_id = abc-123  -- public.users.id
FK controlla auth.users(id)     -- xyz-789 non trovato --> ERRORE
```

Le policy RLS gia' usano `current_app_user_id()` che restituisce `public.users.id`, quindi tutto il sistema e' gia' allineato su `public.users.id`. L'unico problema e' il vincolo FK.

## Soluzione

Cambiare il vincolo FK da `auth.users(id)` a `public.users(id)`, allineandolo al resto del sistema.

## Dettaglio Tecnico

### Migrazione SQL

```sql
-- Rimuovere il FK verso auth.users
ALTER TABLE contact_table_views
  DROP CONSTRAINT contact_table_views_owner_user_id_fkey;

-- Creare il FK verso public.users
ALTER TABLE contact_table_views
  ADD CONSTRAINT contact_table_views_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
```

Nessuna modifica al codice frontend necessaria: `useCreateTableView` e le policy RLS gia' utilizzano correttamente `public.users.id`.

### File da modificare
1. **Nuova migrazione SQL** -- unico file coinvolto

