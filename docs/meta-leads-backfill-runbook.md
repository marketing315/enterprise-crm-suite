# Meta Lead Ads — Backfill storico (Stream 4)

> Procedura operativa per recuperare lead **già esistenti** su Meta che non sono stati ricevuti via webhook in tempo reale (es. webhook non sottoscritto, token scaduto, downtime, onboarding di una nuova pagina).

**Pubblicato:** 2026-05-13 · **Owner:** Admin del brand · **Audience:** Admin / CEO

---

## 1. Quando usare il backfill

| Scenario | Backfill consigliato? |
|---|---|
| Pagina Meta appena collegata (Stream 2 OAuth) | ✅ Sì, finestra 30–90 giorni |
| Webhook Lead Ads disattivo per > 1h | ✅ Sì, finestra = downtime + 1g |
| Token scaduto/revocato e poi ripristinato | ✅ Sì, finestra dal `token_last_checked_at` invalido |
| Disallineamento numerico Meta vs CRM | ✅ Sì, dry-run prima per misurare il delta |
| Reimport "pulizia" su tutto lo storico | ⚠️ Solo via INTERNAL token + finestre da 30g, mai un'unica finestra > 90g |
| Webhook funziona da > 7g e numeri tornano | ❌ Non serve |

---

## 2. Pre-requisiti

Prima di lanciare un backfill verifica:

- [ ] La pagina Meta è collegata via OAuth (`Settings → Meta Lead Ads`, riga con `page_id` valorizzato)
- [ ] L'app è **attiva** (`is_active = true` nella riga; se è stata disattivata dal token health-check, ri-collegare la pagina prima)
- [ ] Stato token `valid` o `expiring_soon` (vedi `meta_token_health_runs` o riga in tabella)
- [ ] Sei loggato come **admin del brand** o **CEO**
- [ ] Hai stimato il volume atteso (vedi limiti sotto). Per > 1.000 lead segmenta per form o per finestre temporali

---

## 3. Configurazione richiesta (una tantum)

| Variabile | Dove | Valore | Note |
|---|---|---|---|
| `META_OAUTH_APP_SECRET` | Edge function secrets | App secret della Meta App | Usato per `appsecret_proof`; obbligatorio se la Meta App ha "Require App Secret Proof" attivo |
| `INTERNAL_SERVICE_TOKEN` | Edge function secrets | Random ≥ 32 char | Usato per la chiamata interna `meta-leads-backfill → meta-leads-recover`. Se assente, **i lead vengono inseriti ma non ingeriti** (rimangono in `meta_lead_events.status='received'` finché non li raccoglie il webhook o un recover manuale) |
| `meta_apps.app_secret` | Riga DB (opzionale per-brand) | App secret di brand | Override per-brand del valore env |
| OAuth scopes della Meta App | Meta App Dashboard | `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `pages_manage_metadata`, `business_management` | Senza `leads_retrieval` la chiamata `/{form_id}/leads` ritorna `(#100) Tried accessing nonexisting field` |
| Modalità della Meta App | Meta App Dashboard | **Live** | In Development solo admin/tester possono leggere i lead |

Per controllare in 30 secondi lato CLI:

```bash
# Con il page token salvato
curl "https://graph.facebook.com/v21.0/me/permissions?access_token=PAGE_TOKEN" | jq '.data[] | select(.permission|test("leads|pages"))'
```

---

## 4. Procedura UI (manuale, raccomandata)

1. Apri **Settings → Meta Lead Ads**
2. Sulla riga della Meta App che vuoi backfillare, click sull'icona **🕘 History** ("Backfill lead storici")
3. Compila:
   - **Giorni indietro** — finestra temporale (default 30, max 365)
   - **Form ID** *(opzionale)* — virgola-separati. Vuoto = tutti i form attivi della pagina (auto-discovery via `/{page_id}/leadgen_forms`)
   - **Limite lead per esecuzione** — default 1.000, hard cap 5.000
4. Click **Anteprima (dry-run)** → conta i lead presenti su Meta nella finestra **senza** scrivere su DB. Risultato:
   - `leads_seen` = totale trovati
   - `forms_scanned`, `pages_fetched` = controllo paginazione
5. Se i numeri sono attesi, click **Esegui backfill**:
   - `leads_inserted` = nuovi `meta_lead_events` creati
   - `leads_duplicate` = già presenti (deduplica `(brand_id, leadgen_id)`)
   - `leads_recovered` = ingeriti con successo (contact + deal + lead_event)
   - `leads_failed` = errore in `meta-leads-recover` (vedi tab Recover o logs)
6. Verifica gli inserimenti:
   - **Contacts** → filtra per `created_at >= now() - 1 hour`
   - **Lead Events** → filtra `source = 'meta'`
   - **Marketing → Sources** → conta per `meta_form_id`

---

## 5. Procedura programmatica (cron / API)

Per backfill ricorrenti (es. notturno safety-net) usa l'edge function direttamente con `INTERNAL_SERVICE_TOKEN`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/meta-leads-backfill" \
  -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
  -H "x-internal-service-token: $INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_id": "<meta_apps.id>",
    "since": "2026-05-06T00:00:00Z",
    "until": "2026-05-13T23:59:59Z",
    "max_leads": 2000,
    "trigger_kind": "cron"
  }'
```

Body completo:

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `source_id` | uuid | — *(obbligatorio)* | `meta_apps.id` |
| `form_ids` | string[] | auto-discover | Limita a form specifici |
| `since` | ISO datetime | `now - 30d` | Lower bound `time_created` |
| `until` | ISO datetime | `now` | Upper bound `time_created` |
| `max_pages` | int | 20 (cap 50) | Pagine Graph per form |
| `max_leads` | int | 1000 (cap 5000) | Hard stop di sicurezza |
| `trigger_kind` | enum | `manual` \| `cron` \| `api` | Solo audit |
| `dry_run` | bool | `false` | Conta senza scrivere |

**Risposta tipo:**
```json
{
  "run_id": "8f3a...",
  "dry_run": false,
  "aborted_max_leads": false,
  "forms_scanned": 3,
  "pages_fetched": 5,
  "leads_seen": 124,
  "leads_inserted": 87,
  "leads_duplicate": 37,
  "leads_recovered": 87,
  "leads_failed": 0,
  "forms": [{ "form_id": "...", "pages": 2, "seen": 80, "inserted": 60, "duplicate": 20 }]
}
```

---

## 6. Limiti operativi

| Limite | Valore | Motivo |
|---|---|---|
| `max_leads` per esecuzione | 5.000 | Evita timeout edge (~150s) e abuso del Graph API rate limit |
| `max_pages` per form | 50 | Safety contro loop di paginazione |
| Finestra temporale UI | 365 giorni | Limite Meta storico recuperabile in modo affidabile |
| Chunk recover | 50 IDs | `meta-leads-recover` processa max 50 per chiamata |
| Concorrenza | **1 per Meta App** | Lanciare 2 backfill paralleli sulla stessa pagina può saturare il rate-limit Graph (`x-app-usage > 100`) |
| Rate Graph API | ~200 chiamate/h per app | Monitora header `x-app-usage` / `x-business-use-case-usage` |

**Stima durata indicativa:**
- 100 lead → ~10s
- 1.000 lead → ~90s
- 5.000 lead → ~7–8 minuti (può colpire timeout edge; usa finestre più piccole)

---

## 7. Audit & osservabilità

Ogni esecuzione (eccetto `dry_run`) crea una riga in `meta_leads_backfill_runs`:

```sql
SELECT id, status, leads_seen, leads_inserted, leads_recovered, leads_failed,
       since_at, until_at, started_at, finished_at, error
FROM meta_leads_backfill_runs
WHERE brand_id = '<brand-uuid>'
ORDER BY started_at DESC
LIMIT 20;
```

Stati:

| `status` | Significato |
|---|---|
| `running` | Esecuzione in corso (o crashata: vedi `finished_at` NULL > 10 min) |
| `completed` | Tutti i lead nuovi sono stati ingeriti |
| `partial` | Almeno una chunk recover è fallita (vedi `leads_failed > 0`) |
| `failed` | Errore fatale prima di iniziare la paginazione (es. token assente, form discovery KO) |

I dettagli per-form sono in `forms` (jsonb): `[{ form_id, pages, seen, inserted, duplicate, error? }]`.

**Logs dell'edge:**
```
Settings → Backend → Edge functions → meta-leads-backfill → Logs
```
I token sono redacted (`access_token=***` + qualunque stringa alfanumerica ≥ 40 char).

---

## 8. Checklist di debug

Usa questa checklist nell'ordine quando un backfill non si comporta come atteso.

### A. "Nessun lead trovato" (`leads_seen = 0`)

- [ ] La pagina ha davvero lead in quella finestra? Verifica su [Meta Lead Center](https://business.facebook.com/leads_center)
- [ ] `meta_apps.page_id` corrisponde alla pagina giusta? (cross-check con `page_id` dell'audit run)
- [ ] Il page token è quello corretto e ha `leads_retrieval`? Lancia il **probe** di `meta-leads-recover` per la stessa pagina:
  ```bash
  curl -X POST .../meta-leads-recover \
    -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
    -d '{"probe": {"source_id":"<meta_apps.id>","form_id":"<id>"}}'
  ```
  Atteso: `form_visible` 200 e `form_leads_list` 200.
- [ ] La finestra `since/until` non è invertita o nel futuro
- [ ] Il form ha `status: ACTIVE` (form archiviati possono non restituire lead via API)

### B. `leads_inserted = 0` ma `leads_seen > 0`

- Tutti i lead sono **duplicati** già presenti in `meta_lead_events` (caso normale per backfill ripetuti, vedi `leads_duplicate`)
- Verifica con:
  ```sql
  SELECT COUNT(*) FROM meta_lead_events
  WHERE brand_id = '<brand>' AND received_at >= '<since>';
  ```

### C. `leads_inserted > 0` ma `leads_recovered = 0`

Significa che `meta-leads-recover` non è stato chiamato (o è fallito tutto):

- [ ] `INTERNAL_SERVICE_TOKEN` è configurato? Senza, il backfill **inserisce ma non chiama recover** (le righe restano `status='received'`)
- [ ] L'edge `meta-leads-recover` è deployata? Controlla logs
- [ ] Esegui recovery manuale per quel brand:
  ```bash
  curl -X POST .../meta-leads-recover \
    -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
    -d '{"brand_id":"<brand>"}'
  ```

### D. `leads_failed > 0` (status `partial`)

- [ ] Apri `meta_lead_events` filtrando `status='error'`, leggi colonna `error`
- [ ] Errori frequenti:
  - `find_or_create_contact: …` → telefono malformato o concorrenza; ri-lanciare il recover dopo verifica
  - `lead_event_insert: 23505` → duplicato già ingerito da webhook (innocuo, gli eventi vengono marcati `ingested`)
  - `Graph API 400 status=400 body=… (#190) Error validating access token` → token revocato/expired, ri-collegare la pagina

### E. Errore fatale (`status='failed'` immediato)

- `discover_forms: … 200 body={"data":[]}` → la pagina non ha leadgen_forms, oppure il page token non ha `pages_show_list`/`leads_retrieval`
- `app_not_found` → `source_id` errato
- `no_token` → `meta_apps.access_token` vuoto o vault mismatch (re-collega via OAuth)
- `forbidden` → utente chiamante non admin del brand

### F. Rate limit Graph

Se vedi nei logs `(#17) User request limit reached` o `x-app-usage > 90`:

- Riduci `max_leads` a 500 per esecuzione
- Spalma su finestre orarie più piccole
- Attendi 1h tra esecuzioni sulla stessa pagina

---

## 9. Rollback / pulizia

Il backfill **non sovrascrive mai** lead esistenti (deduplica su `(brand_id, leadgen_id)`). Se hai ingerito lead che NON volevi:

1. Identifica i nuovi inserimenti dell'ultima ora:
   ```sql
   SELECT id, leadgen_id, contact_id, lead_event_id
   FROM meta_lead_events
   WHERE brand_id = '<brand>'
     AND received_at >= now() - interval '1 hour'
     AND raw_event ? 'backfill';
   ```
2. **NON** eseguire `DELETE` diretto sui contatti — viola la **Data Safety HARD rule**. Usa invece `archive_contact()` per ciascun contact_id (soft-delete).
3. Per rimuovere i `lead_events` creati, contatta lo sviluppatore (rimozione da audit table richiede migration esplicita).

---

## 10. Riferimenti

- **Edge function**: `supabase/functions/meta-leads-backfill/index.ts`
- **Audit table**: `meta_leads_backfill_runs`
- **UI**: `src/components/settings/meta/MetaBackfillDialog.tsx`
- **Recover function** (chained): `supabase/functions/meta-leads-recover/index.ts`
- **Token health**: `docs/meta-lead-ads.md` § Token Health Check
- **Meta Graph reference**: <https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving>
- **Meta Lead Center**: <https://business.facebook.com/leads_center>
