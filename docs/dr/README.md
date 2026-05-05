# Disaster Recovery Runbooks

Cartella che raccoglie i runbook operativi per il Disaster Recovery della piattaforma.

| Runbook | Scenario | RPO target | RTO target |
|---------|----------|------------|------------|
| [01 - Replay massivo DLQ](./01-dlq-mass-replay.md) | Outage downstream → migliaia di webhook in DLQ | 0 (nessuna perdita: payload conservati) | < 4 h |
| [02 - PITR Restore](./02-pitr-restore.md) | Corruzione DB / cancellazione massiva accidentale | < 5 min (PITR continuo) | < 2 h |
| [03 - Edge Functions Failover](./03-edge-failover.md) | Edge Functions down → degraded mode + queue locale | 0 (queue persistente) | < 30 min |

## Convenzioni comuni

- **Severità**: ogni runbook indica i livelli (`SEV-1` → blocco totale, `SEV-2` → degrado parziale).
- **Comunicazione**: aggiornare lo status page e Slack `#incidents` ogni 30 min minimo durante l'esecuzione.
- **Post-mortem**: obbligatorio entro 5 giorni lavorativi per qualsiasi esecuzione di un runbook DR (template in `docs/dr/post-mortem-template.md`).
- **Drill**: test semestrali in sandbox (`.env.e2e`) — script automatizzati in `scripts/dr/`.

## Game-day log

| Data | Tipo | Report |
|------|------|--------|
| 2026-05-05 | Tabletop + read-only verification (tutti i 3 runbook) | [game-day-2026-05-05.md](./game-day-2026-05-05.md) |

> Prossimo game-day pianificato: **2026-11-05**.

## Roles & contacts

| Ruolo | Responsabilità in DR |
|-------|----------------------|
| **Incident Commander** | Coordinatore unico, decisioni go/no-go |
| **Tech Lead** | Esecuzione tecnica del runbook |
| **Comms Lead** | Status page, Slack, email clienti |
| **Customer Success** | Gestione ticket clienti durante l'incident |

## Ordine di precedenza

Se più runbook sono applicabili contemporaneamente, eseguirli in quest'ordine:
1. **02 - PITR Restore** (se c'è corruzione dati: tutto il resto è inutile finché il DB non è sano)
2. **03 - Edge Failover** (ripristina capacità di processare nuovi eventi)
3. **01 - DLQ Replay** (recupera ciò che è rimasto indietro)
