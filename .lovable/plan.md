## Obiettivo
Aggiornare i pulsanti guida ("?" PageHelpButton in alto a destra su ogni pagina) per riflettere TUTTO ciò che è stato sviluppato nelle ultime fasi (F2-F5, Performance Hub, Meta CAPI, Onboarding, ecc.), così che ogni sezione abbia istruzioni chiare, aggiornate e C-Level.

## Stato attuale
Il file `src/components/layout/PageHelpButton.tsx` contiene un dizionario `pageHelpContent` con voci per ~22 route. Mancano o sono obsolete molte sezioni nuove introdotte di recente.

## Cosa aggiornare

### A. Nuove voci da aggiungere (route oggi senza guida)
1. `/performance` — Performance Hub (panoramica F0-F5, navigazione alle suite)
2. `/sales/performance-sheet` — Foglio ESITO APPUNTAMENTI, bonus tier, export Sheet, IVA 22%
3. `/sales/performance-sheet/:userId` — Drill-down venditore (funnel + trend 12m)
4. `/callcenter/wallboard` — KPI live, filtri data, refresh configurabile, canale inbound
5. `/callcenter/transcripts` — Trascrizioni Whisper, sentiment cliente/operatore, diarizzazione, filtri
6. `/marketing/performance` — MV freshness, confronto A/B sorgenti, CPL, import costi CSV
7. `/admin/performance-alerts` — Regole CPL/AnswerRate/Delivery/Sentiment, cooldown, eventi
8. `/admin/data-retention` — DPIA, retention audio/transcripts/alert, dry-run cleanup
9. `/admin/sheets-health` — SLO export Sheets, reconciliation, trigger critici
10. `/admin/cron-jobs` — Registry cron, drift detection
11. `/admin/incidents` — Error boundary report, retry budget
12. `/admin/slo-board`, `/admin/observability`, `/admin/siem-export`, `/admin/sessions`, `/admin/quick-backup`, `/admin/contacts-dedup`, `/admin/data-quality`, `/admin/changelog`, `/admin/audit`, `/admin/capi-monitor`, `/admin/ai-decisions-drilldown`, `/admin/notification-webhooks`, `/admin/ticket-escalation-audit`, `/admin/setup`, `/admin/slow-queries`
13. `/settings/security` — MFA, sessioni, idle timeout, password policy

### B. Voci esistenti da aggiornare (contenuto obsoleto)
- `/contacts` — aggiungere dedup admin, soft-delete, tag, quiz
- `/pipeline` — aggiungere stale-deal (optimistic concurrency), AI tagging
- `/appointments` — aggiungere risk score, sales availability, audit timeline, saved filters, bulk reassign (già citato, ma espandere)
- `/tickets` — aggiungere auto-escalation, simulator, hierarchy
- `/marketing` — sostituire con riferimento a `/marketing/performance` + Meta Lead Ads + CAPI
- `/settings` — aggiungere VOIspeed, Meta OAuth, Google Sheets, Keplero, webhook sources, CAPI setup
- `/dashboard` — aggiungere ruolo-aware (CEO/Admin/Sales/CallCenter)
- `/azienda` — aggiungere CEO governance M13 (budget, ROI, spese)
- `/team` — aggiungere RBAC, hierarchy, MFA enforcement
- `/admin/ai`, `/admin/ai-metrics`, `/admin/dlq`, `/admin/webhooks` — refresh sintetico

### C. Struttura coerente per ogni voce
Mantenere il pattern attuale:
- `title` + `description` (1 frase C-level)
- `quickActions` (massimo 3, ognuna con 3 step concreti)
- `tips` (2-4 bullet)
- `docsPath` quando esiste documentazione in `docs/`

### D. Matching route migliorato
La logica attuale di fallback a parent path funziona, ma servono entry esplicite per i sotto-percorsi più visitati (`/sales/*`, `/callcenter/*`, `/marketing/*`, `/admin/*`).

## File coinvolti
- `src/components/layout/PageHelpButton.tsx` — unica modifica (espansione del dizionario `pageHelpContent`).
- Nessun cambio a logica, routing, design system o componenti UI: aggiornamento puramente di contenuti testuali.

## Non incluso
- Nessuna modifica al tour onboarding (`AppTour.tsx`) — già aggiornato in iterazione precedente.
- Nessun nuovo componente o route.
- Nessun cambio a `docs/` (i link puntano a file già esistenti).

## Conferma richiesta
Confermi di voler aggiornare/aggiungere **tutte** le ~35 voci elencate sopra in `PageHelpButton.tsx`, oppure preferisci limitarti a un sottoinsieme (es. solo nuove F2-F5 + Performance Hub)?