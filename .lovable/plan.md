## Pipeline di remediation — Audit Bug Piattaforma

L'audit ha 67 bug. Li raggruppo in 5 sprint da ~1 settimana ciascuno, ordinati per rischio decrescente: prima ciò che protegge dati e denaro, poi ciò che migliora qualità e UX. Ogni sprint chiude un blocco coerente di bug così da rilasciare un valore visibile alla fine di ogni settimana.

Lavorerò in **modalità Ralph loop**: per ogni sprint, prima fix mirati, poi verifica (query DB / test / preview), poi memoria aggiornata, poi prossimo sprint.

---

### Sprint 1 — Sicurezza, RLS e integrità dati (BLOCCANTE)

**Bug coperti:** SEC-001, SEC-002, SEC-005, W-001, LE-001, CT-001, TR-002 (parte 1: contacts/tickets), C-007 (parte 1: confirm dialog).

**Cosa cambia per l'utente:**
- Un admin di un brand non potrà più (per bug) toccare ruoli di altri brand. Nessun cambio visibile per uso normale.
- I log audit non sono più cancellabili: se qualcuno ci provava, ora otterrà errore. Comportamento corretto.
- I webhook in arrivo (Meta, Keplero, ecc.) non creeranno più lead duplicati durante incidenti del DB. Possibile aumento di risposte "503 retry" lato sorgente, che è il comportamento giusto.
- I pulsanti cestino su contatti/ticket/costi chiederanno conferma prima di agire.
- Cancellare un contatto/ticket non lo elimina più fisicamente: diventa "archiviato" (soft-delete) e tracciato. Le viste già escludono gli archiviati, quindi visivamente nulla cambia, ma è recuperabile.

**Rischio rollback:** basso. Tutte modifiche additive (nuove colonne `archived_at`, nuove policy più strette). I dati esistenti restano.

---

### Sprint 2 — Calcoli C-level (CEO Dashboard)

**Bug coperti:** C-001, C-002, C-003 (+ TR-001 sistemico), C-004, C-005, C-006, C-010, C-012, C-014, C-015, C-016, C-017.

**Cosa cambia per l'utente:**
- I KPI del CEO Dashboard cambieranno valore. È atteso: oggi sono **sbagliati**.
  - "ROI Marketing" sarà più basso e realistico (oggi sovrastima del 5-10x).
  - I confronti periodo corrente vs precedente saranno coerenti → meno alert "margine in calo" falsi.
  - Le date dei filtri rispetteranno il fuso orario italiano (oggi sono shiftate di -1 giorno).
  - Il budget mensile comparirà anche nei range "ultimi 7 giorni".
  - I deal "won" senza data di chiusura entreranno nel fatturato.
- Aggiungo banner "I criteri di calcolo sono stati aggiornati il <data>" per evitare panico C-level.
- I dashboard si aggiornano in tempo reale dopo aver inserito un costo (oggi serviva refresh manuale).

**Rischio:** medio. Numeri visibili al CEO cambieranno. Va comunicato.

---

### Sprint 3 — Compliance, GDPR, sessioni

**Bug coperti:** TR-002 (estensione a expenses, budgets, deals), C-007 (audit completo), C-020, AUTH-001, AUTH-002, SEC-003 (CORS), SEC-004.

**Cosa cambia per l'utente:**
- **Idle timeout 30 min** (15 min per admin/CEO — già implementato in `IdleTimeoutWatcher`, lo verifico solo). Modal di avviso a 60 secondi dalla scadenza.
- Niente più auto-signup: l'unica via per creare utenti resta "Crea utente" lato admin. Form `/signup` rimosso.
- Tutti i pulsanti "elimina" su dati finanziari richiedono conferma esplicita e lasciano traccia (chi/quando/motivo opzionale).
- CORS chiuso sulle edge function server-to-server. Possibile rottura di tool esterni custom: chiederò conferma se ci sono integrazioni note.

**Rischio:** medio sui CORS, basso sul resto.

---

### Sprint 4 — Robustezza concorrenza (race conditions)

**Bug coperti:** P-001, P-002, T-002, T-003, T-004, A-001, A-002, W-002, W-003, W-004, W-006, W-007, W-008.

**Cosa cambia per l'utente:**
- Drag & drop nel Kanban: se la mossa fallisce (rete, server), il deal torna nella colonna originale con toast d'errore. Oggi resta "stuck" finché non si ricarica.
- Due manager non potranno più auto-assegnarsi lo stesso ticket — il secondo riceve un messaggio chiaro.
- Non più doppi appuntamenti per lo stesso commerciale nello stesso slot.
- Notifiche SLA non duplicate.
- Quota AI per brand: limite mensile token configurabile. Quando si avvicina al limite l'admin riceve notifica.
- Webhook Meta validano timestamp (anti-replay).

**Rischio:** basso. Tutto refactor server-side trasparente all'utente.

---

### Sprint 5 — Pattern sistemici, UX, debt

**Bug coperti:** TR-003 (cache graph), TR-004 (componente `<EuroInput>`), TR-005 (strict TS), CT-003, CT-004, CT-005, T-005, T-006, T-007, C-008 (date selector vincolato), C-009 (parsing euro IT), C-011 (`isAdminFor(brand)`), C-013, C-018, C-019, C-021 (rimozione dashboard CEO legacy), AI-001, I-001, W-005, LE-002.

**Cosa cambia per l'utente:**
- Gli input di importi accettano formato italiano `1.234,56` senza più corrompere i dati.
- Il selettore date impedisce range invertiti.
- Soglie alert configurabili in `Settings → CEO → Alert Thresholds`.
- Niente più dashboard CEO duplicate (rimuovo la legacy).
- Liste contatti grandi: banner "X di Y" + ricerca prefetch.

**Rischio:** basso, principalmente quality-of-life.

---

### Cosa NON è incluso (backlog)

- Forecast YoY, export PDF/XLSX dashboard, eval AI continua, indici DB period-based avanzati. Sono **valore aggiunto**, non bug. Andranno in roadmap separata se confermerai priorità.

---

### Ordine di esecuzione concreto

```text
Sprint 1 → Sprint 2 → comunicazione CEO → Sprint 3 → Sprint 4 → Sprint 5
```

Inizio con lo **Sprint 1** subito dopo la tua approvazione. Per ogni sprint farò:

1. Migration SQL (richiede tua conferma)
2. Codice client/edge function (in parallelo al review della migration)
3. Smoke test su preview
4. Aggiornamento memoria progetto (`mem://`)
5. Commit messaggio chiaro per il changelog

### Domande prima di partire

1. **Sprint 1 può procedere?** È quello a rischio più basso e impatto sicurezza più alto.
2. **Quando i numeri CEO cambieranno (Sprint 2), vuoi un banner di avviso in dashboard o preferisci una mail/notifica al CEO?**
3. **Su CORS chiusi (Sprint 3): hai integrazioni custom esterne (Zapier, Make, script tuoi) che chiamano direttamente le edge function?** Se sì, le aggiungo all'allowlist.
