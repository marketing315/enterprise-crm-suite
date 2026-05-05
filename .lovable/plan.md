## A2 — OAuth tokens in Vault

**Stato attuale:** colonne `access_secret_id`/`refresh_secret_id` già aggiunte (migration P0). Vault attivo. 1 solo record `oauth_tokens` (provider `google_ads`) ancora con token in chiaro nelle colonne `*_encrypted`. Tre edge function leggono/scrivono i token: `google-oauth-callback`, `meta-oauth-callback`, `google-ads-sync`.

### Obiettivo
Spostare i token OAuth dentro `vault.secrets`, lasciando le colonne legacy come fallback finché tutti i provider non sono migrati. Nessuna funzione esterna deve rompersi.

### Piano

**1. Migration additiva — RPC vault wrapper (SECURITY DEFINER)**
   - `vault_put_oauth_secret(p_token_id uuid, p_kind text, p_value text) returns uuid`
     - `p_kind ∈ ('access','refresh')`
     - Se `value` vuoto/NULL → cancella eventuale secret e azzera la colonna `*_secret_id`
     - Altrimenti: se esiste già `*_secret_id` → `vault.update_secret(id, value)`; altrimenti `vault.create_secret(value, name)` con `name = 'oauth:'||token_id||':'||kind` e salva l'`id` nella colonna corrispondente
     - Pulisce la colonna legacy `*_token_encrypted = ''` quando il secret è scritto
   - `vault_get_oauth_secret(p_token_id uuid, p_kind text) returns text`
     - Legge da `vault.decrypted_secrets` via `*_secret_id`; fallback alla colonna legacy se `*_secret_id IS NULL`
   - Entrambe `SECURITY DEFINER`, `search_path = public, vault`, `REVOKE ... FROM anon, authenticated`, `GRANT ... TO service_role` (solo edge function via service role).
   - Backfill in coda alla migration: per ogni riga con `access_token_encrypted <> ''` e `access_secret_id IS NULL` → chiamata a `vault_put_oauth_secret(...)`. Idem refresh. Idempotente.

**2. Edge function — usare le RPC**
   - `google-oauth-callback`: dopo `upsert` su `oauth_tokens`, chiamare `vault_put_oauth_secret(id, 'access', access_token)` e `(id, 'refresh', refresh_token)`. Inserire stringa vuota nelle colonne `*_token_encrypted` (default già `''`).
   - `meta-oauth-callback`: stesso pattern, solo `access` (Meta non ha refresh).
   - `google-ads-sync`: leggere via `vault_get_oauth_secret(id, 'access')` e `(id, 'refresh')`. Dopo refresh token → `vault_put_oauth_secret(id, 'access', newAccessToken)` invece di `update access_token_encrypted`.

**3. Compatibilità**
   - Le colonne legacy restano nello schema (constraint Data Safety).
   - Fallback in lettura garantisce che record non ancora migrati continuino a funzionare.
   - Il backfill della migration sposta subito l'unico token esistente (`google_ads`) in Vault.

### Tecnico
- Vault namespace nome secret: `oauth:<token_id>:access|refresh` per tracciabilità.
- `update_secret` di Vault riusa lo stesso `id` → nessun leak di reference.
- RPC ritorna l'`id` del secret così la stessa edge function può scriverlo nella colonna `*_secret_id` se in futuro si volesse, ma il wrapper la aggiorna già internamente con `UPDATE oauth_tokens`.
- Nessuna modifica al frontend, nessuna RLS toccata, append-only.

### Cosa NON faccio
- Non droppo le colonne `*_token_encrypted` (Data Safety HARD).
- Non tocco gli scope o l'expires_at.
- Non aggiungo nuovi provider.

Confermi e procedo con migration + patch delle 3 edge function?