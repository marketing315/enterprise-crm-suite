# Stream 2 — Scope completi + UI connessione pagina

## Obiettivo

Dopo che un admin completa l'OAuth con Facebook, mostrare automaticamente le Pagine accessibili e permettere di collegarne una con un click. Il "collegamento" deve:
1. Recuperare il **Page Access Token** (long-lived, ~60gg) per quella specifica pagina
2. Creare/aggiornare una riga in `meta_apps` per il brand corrente con quel token
3. Iscrivere la pagina al webhook leadgen automaticamente (`POST /{page_id}/subscribed_apps`)
4. Sincronizzare anche `ad_account_id` (selezionabile) e popolare `app_secret` dall'env condivisa

## Architettura attuale (già in DB)

- `meta_apps` — 1 riga per brand: `page_id`, `access_token`, `app_secret`, webhook receiver
- `oauth_tokens` (provider=`meta_ads`) — token user-level salvato dal callback OAuth, usato dal sync stats Ads
- Manca un ponte: il callback OAuth oggi salva solo in `oauth_tokens`, non popola `meta_apps`

## Componenti nuovi

### Edge `meta-list-pages` (POST, JWT auth admin/CEO)
Body: `{ brand_id }`. Risponde:
```json
{
  "pages":     [{ "id":"...", "name":"...", "category":"..." }],   // GET /me/accounts
  "businesses":[{ "id":"...", "name":"..." }],                      // GET /me/businesses
  "ad_accounts":[{ "id":"act_...", "name":"...", "currency":"..." }]// GET /me/adaccounts
}
```
Risolve il token user dalla riga `oauth_tokens` (provider=meta_ads, brand_id) via `vault_get_oauth_secret`. Tutti i fetch passano per `withProof` (Stream 1).

### Edge `meta-connect-page` (POST, JWT auth admin/CEO)
Body: `{ brand_id, page_id, ad_account_id?: string }`.
Flusso:
1. Verifica admin/CEO + `assert_brand_membership(brand_id)`
2. `GET /{page_id}?fields=access_token,name` → ottiene **Page Token** long-lived (eredita la durata del User Token long-lived)
3. Upsert in `meta_apps` (`brand_id` come chiave): `page_id`, `access_token=pageToken`, `ad_account_id`, `app_secret=META_OAUTH_APP_SECRET`, `is_active=true`, `token_status='valid'`, `token_last_checked_at=now()`
4. `POST /{page_id}/subscribed_apps?subscribed_fields=leadgen` con Page Token + `appsecret_proof`
5. Audit: insert in `meta_token_health_runs` con status `valid`
6. Risposta: `{ ok:true, meta_app_id, page_name, subscribed:true }`

### Frontend
- **Hook** `useMetaPagesAvailable(brandId)` — invoca `meta-list-pages`, ritorna `{ pages, businesses, ad_accounts, loading, error }`. Gestisce caso "OAuth non completato" → mostra CTA "Connetti Meta" che apre la URL di `meta-oauth-start`.
- **Componente** `MetaPageConnectDialog` — Dialog con lista Pagine (RadioGroup) + dropdown Ad Account opzionale + bottone "Collega". Su success chiude e invalida la query `meta-apps` di `useMetaApps`.
- **Integrazione**: in `MetaAppsSettings.tsx` aggiungere pulsante secondario **"Collega pagina (OAuth)"** accanto a "Nuova Meta App". Apre `MetaPageConnectDialog`. Se OAuth non ancora fatto, mostra prima CTA verso start-oauth.

## Migrazione (nessuna)

Riusiamo le colonne esistenti di `meta_apps`. Il nuovo flusso convive con quello manuale: chi vuole può ancora inserire i campi a mano dal drawer esistente.

## Note tecniche

- **Scope OAuth già aggiornati in Stream 1**: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval`, `pages_manage_engagement`, `business_management`, `ads_management`, `ads_read`, `email`. Sufficienti per `subscribed_apps` + `me/accounts` + `me/adaccounts`.
- **app_secret** in `meta_apps` sarà popolato con `META_OAUTH_APP_SECRET` env (non più richiesto a mano nel form OAuth-driven). Validazione: se manca env → 422.
- **Idempotenza**: upsert `meta_apps` su `(brand_id, page_id)` se esiste constraint, altrimenti su `brand_id`. Verifica vincoli prima dell'edge.
- **Errori comuni**:
  - Page token non disponibile → utente deve concedere `pages_show_list` (re-auth)
  - `subscribed_apps` 200 success ma webhook non riceve → app in Development Mode (fuori scope, documentare)
- **Audit**: log_audit_event `META_PAGE_CONNECTED` con `{brand_id, page_id, page_name, ad_account_id}`.
- **Cron-relay whitelist**: non serve (call user-driven).

## Ordine implementazione

1. Verifica unique constraint su `meta_apps` (`brand_id` o `brand_id,page_id`)
2. Edge `meta-list-pages`
3. Edge `meta-connect-page`
4. Hook `useMetaPagesAvailable`
5. Component `MetaPageConnectDialog`
6. Integrazione in `MetaAppsSettings`
7. Memory update

## Fuori scope (separato)

- UI per gestire **più pagine** per brand (oggi 1 brand = 1 meta_apps row)
- Refresh automatico Page Token quando User Token long-lived scade (l'health-check Stream 3 lo segnala già; refresh richiede re-OAuth admin)
- Backfill storico lead per pagina (= Stream 4)

Confermi questa architettura, in particolare:
- (a) **1 brand = 1 pagina collegata** (upsert su `brand_id`), oppure vuoi supportare **più pagine per brand** (richiede modifica unique constraint)?
- (b) `app_secret` auto-popolato da env `META_OAUTH_APP_SECRET` (single Meta App per tutta l'installazione) — confermi?
