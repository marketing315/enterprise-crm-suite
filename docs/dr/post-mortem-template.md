# Post-Mortem — [Titolo incident]

**Data incident**: YYYY-MM-DD
**Severità**: SEV-1 / SEV-2 / SEV-3
**Durata**: HH:MM (detection → resolved)
**Runbook usato**: [link al runbook DR]
**Incident Commander**: nome
**Autore post-mortem**: nome
**Data post-mortem**: YYYY-MM-DD (entro 5 gg lavorativi)

---

## TL;DR (3 righe max)

Cos'è successo, qual è stato l'impatto user-facing, qual è la root cause.

## Timeline

| Quando (UTC) | Cosa è successo |
|--------------|-----------------|
| HH:MM | Primo segnale (alert / report utente) |
| HH:MM | Detection conferma |
| HH:MM | Incident dichiarato, IC assegnato |
| HH:MM | Diagnosi completata: root cause = X |
| HH:MM | Mitigazione applicata |
| HH:MM | Sistema completamente ripristinato |
| HH:MM | Comunicazione "tutto risolto" inviata |

## Impatto

- **Utenti coinvolti**: numero (o "tutti" / "brand X")
- **Funzionalità impattate**: lista
- **Dati persi/corrotti**: sì/no, dettaglio
- **Revenue impact** (se quantificabile): €
- **Reputational impact**: media/social

## Root cause

Spiegare la causa tecnica con dettaglio sufficiente per chi non era nell'incident.
Se più cause concorrenti (Swiss cheese model), elencarle tutte.

## Cosa ha funzionato

- Detection automatica entro X min
- Runbook chiaro e applicato senza esitazioni
- Comunicazione interna fluida

## Cosa NON ha funzionato

- Alert non triggerato perché soglia troppo alta
- Runbook obsoleto su comando X
- Tool Y mancante

## Action items

| Owner | Action item | Priorità | Due date |
|-------|-------------|----------|----------|
| @nome | Aggiungere alert SLO su Z | P0 | 2026-XX-XX |
| @nome | Aggiornare runbook con nuovo step | P1 | 2026-XX-XX |
| @nome | Implementare circuit breaker | P2 | 2026-XX-XX |

**Regola**: action item devono essere **tecnici** quando possibile, non procedurali ("ricordare di fare X" è anti-pattern).

## Lezioni apprese

Insight generali utili al team, anche al di là di questo incident specifico.

## Allegati

- Link a Slack thread
- Link a query/dashboard usate per la diagnosi
- Screenshot rilevanti
