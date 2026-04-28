# DR Runbook 02 — Point-In-Time Recovery (PITR) Restore

**Scenario**: corruzione dati, cancellazione massiva accidentale (es. `DELETE` senza `WHERE`), bug applicativo che ha sovrascritto migliaia di record. È necessario riportare il database a uno stato precedente preservando il più possibile le scritture successive.

- **RPO**: < 5 min (Lovable Cloud / Supabase mantiene WAL continuo)
- **RTO target**: < 2 ore per DB < 50 GB
- **Severità tipica**: SEV-1

---

## 1. STOP — Decisione Go/No-Go

**ATTENZIONE**: un PITR restore **sovrascrive** il database. Tutte le scritture tra il timestamp di restore e "adesso" andranno **perse** salvo essere state esportate prima.

Prima di procedere, l'Incident Commander deve confermare con almeno **2 stakeholder**:

- [ ] La corruzione è confermata e quantificata
- [ ] Non esiste un fix in-place più rapido (es. UPDATE correttivo via migration)
- [ ] Le scritture perse nell'intervallo sono accettabili O sono state esportate
- [ ] Il timestamp target di restore è preciso al minuto

Documentare la decisione in `#incidents` con motivazione.

## 2. Identificare il timestamp target

```sql
-- Trova l'ultimo evento "sano" prima del danno
SELECT max(occurred_at)
FROM public.audit_events
WHERE entity_type = 'X'
  AND action IN ('create', 'update')
  AND occurred_at < '2026-04-28T14:30:00Z'; -- prima del momento del danno
```

**Regola pratica**: scegliere un timestamp **5-10 minuti prima** del primo evento sospetto, per avere un margine di sicurezza.

## 3. Esportare le scritture "buone" successive (se possibile)

Se tra il timestamp di restore e "adesso" ci sono scritture legittime da preservare, esportarle prima:

```bash
# Esempio: salvare i nuovi contatti creati dopo il restore point
psql "$DATABASE_URL" -c "\COPY (
  SELECT * FROM public.contacts
  WHERE created_at > '2026-04-28T14:25:00Z'
    AND created_at < now()
) TO '/tmp/contacts-rescue.csv' CSV HEADER;"
```

Le tabelle critiche da considerare per un export di salvataggio:
- `contacts`, `deals`, `appointments`, `sales_orders`
- `chat_messages` (potrebbero esserci messaggi importanti)
- `audit_events` ovviamente — è append-only, copiare l'intero range
- `tickets`

## 4. Esecuzione del restore

**Lovable Cloud** (Supabase managed):

1. Aprire la dashboard backend del progetto
2. Database → Backups → **Point-in-Time Recovery**
3. Selezionare il timestamp esatto identificato in §2
4. Confermare il restore
5. **ATTESA**: 30 min - 2 h a seconda della dimensione DB
6. Durante il restore il DB è **non disponibile** — l'app va in maintenance mode

> ℹ️ Il PITR Lovable Cloud crea un nuovo DB e ridireziona la connection string automaticamente. Le edge functions e l'app frontend usano il nuovo DB senza configurazione manuale.

## 5. Validazione post-restore

```sql
-- 5.1 Verifica che il restore point sia corretto
SELECT max(created_at) FROM public.audit_events;
-- Deve essere ≤ timestamp target

-- 5.2 Conteggi sanity check
SELECT 'contacts' AS t, count(*) FROM public.contacts
UNION ALL SELECT 'deals', count(*) FROM public.deals
UNION ALL SELECT 'tickets', count(*) FROM public.tickets
UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events;

-- 5.3 Verifica RLS (NON si è dis-abilitato)
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Risultato atteso: vuoto o solo tabelle whitelisted
```

## 6. Re-import scritture buone (se §3 eseguito)

```sql
-- Pre-flight: verifica conflitti di id
SELECT count(*) FROM public.contacts
WHERE id IN (SELECT id FROM tmp_rescue_contacts);
-- Se > 0, gestire merge manualmente

-- Import (esempio contacts)
\COPY public.contacts FROM '/tmp/contacts-rescue.csv' CSV HEADER;
```

**Cautela**: re-importare solo le tabelle che non hanno trigger downstream pericolosi (es. trigger che inviano webhook). Se necessario, disabilitare temporaneamente i trigger:

```sql
ALTER TABLE public.contacts DISABLE TRIGGER ALL;
-- import
ALTER TABLE public.contacts ENABLE TRIGGER ALL;
```

## 7. Smoke test funzionale

- [ ] Login con utente admin OK
- [ ] Lista contatti carica correttamente
- [ ] Creazione nuovo contatto OK
- [ ] Pipeline kanban renderizza
- [ ] Dashboard CEO mostra metriche
- [ ] Webhook ingestion funziona (curl di test)
- [ ] Edge functions cron riprese (controllare log entro 10 min)

## 8. Comunicazione

- **Pre-restore**: status page → "manutenzione programmata 30-120 min"
- **Durante**: update Slack ogni 15 min
- **Post**: email a tutti gli utenti attivi nelle ultime 24h con riassunto
- **Per i clienti**: chiarire cosa è andato perso (se qualcosa)

## 9. Post-mortem (entro 5 gg lavorativi)

**Obbligatorio** per qualsiasi PITR. Includere:
- Causa root della corruzione
- Quanti record sono stati persi nell'intervallo restore→now
- Action items per prevenzione (es. constraint mancanti, code review process)
- Eventuale aggiornamento di questo runbook

---

**Test drill semestrale**: vedi `scripts/dr/drill-pitr-validation.sh` (verifica che PITR sia abilitato e che i backup degli ultimi 7 giorni siano disponibili — non esegue un restore vero).
