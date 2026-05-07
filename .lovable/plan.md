## Obiettivo
Abbassare rapidamente il carico I/O dell’istanza e impedire che torni al 100%.

## Evidenza trovata
- Backend Lovable Cloud risponde, quindi non sembra un down infrastrutturale.
- Il carico principale arriva da cleanup/log interni, non dalla nuova dashboard marketing.
- Query più pesante: `admin_purge_cron_job_run_details` ha consumato circa 38,5M blocchi letti e ~3.591s totali.
- `cron.job_run_details` è la tabella più grande: circa 150 MB.
- `net._http_response` ha avuto circa 1,7M insert storici da chiamate HTTP cron.
- Nelle ultime 6 ore ci sono stati ~8.074 run cron riusciti; molti job girano ogni minuto o ogni 30 secondi.
- Rimangono circa 227.311 righe in `cron.job_run_details`, di cui solo ~3.699 oltre 7 giorni: quindi i cleanup aggressivi ora fanno più scansioni che beneficio.

## Piano operativo

### 1. Hotfix immediato: fermare la tempesta I/O
- Disattivare o rendere innocuo il cleanup ripetitivo su `cron.job_run_details` finché il backlog è basso.
- Sostituire i cleanup “scan + delete” con batch piccoli e indicizzati.
- Evitare `VACUUM FULL` automatici durante traffico live: sono troppo costosi per I/O.

### 2. Indici mirati sui log di sistema
Aggiungere indici concorrenti/non bloccanti dove possibile per evitare scansioni complete:
- `cron.job_run_details(start_time)`
- `cron.job_run_details(end_time)`
- `net._http_response(created)`

Questi servono perché le retention filtrano sempre su tempo.

### 3. Ridurre la frequenza dei cron rumorosi
Razionalizzare i job più frequenti:
- `process-email-queue`: da 30 secondi a 1-2 minuti se non c’è backlog reale.
- Cron relay ogni minuto: mantenere solo quelli revenue-critical davvero necessari.
- Job fallito `mcp-slo-evaluator`: correggere o sospendere temporaneamente per evitare rumore inutile.

### 4. Cleanup sicuro e progressivo
- Eseguire cleanup in batch piccoli, con limite per run e senza loop illimitati.
- Retention consigliata:
  - `cron.job_run_details`: 7 giorni
  - `net._http_response`: 2 giorni
- Nessuna cancellazione su tabelle business.

### 5. Monitoraggio post-fix
Aggiungere/aggiornare una query di controllo per misurare:
- righe residue in `cron.job_run_details`
- righe residue in `net._http_response`
- dimensione database
- top query per blocchi letti/scritti
- numero di run cron per ora

### 6. Capacità istanza
Se dopo l’hotfix l’I/O resta alto, il carico cron + automazioni è superiore alla capacità attuale: aumentare la dimensione dell’istanza da **Backend → Advanced settings → Upgrade instance**. Il resize può richiedere alcuni minuti e può incidere sull’utilizzo/billing.

## Cosa implementerò appena approvi
- Una migration di emergenza che:
  - crea gli indici temporali mancanti;
  - rende i cleanup limitati e non aggressivi;
  - riduce o sospende i job cron più rumorosi/non critici;
  - lascia intatte tutte le tabelle business.
- Poi verificherò con query live che i top consumer I/O e il numero di run cron siano scesi.