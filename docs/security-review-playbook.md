# Quarterly Security Review & Incident Drill Playbook

> Cadenza: **Q1 / Q2 / Q3 / Q4** — prima settimana del trimestre.  
> Owner: **Engineering Lead** (coordinamento), con contributi da CX Ops e Sales Ops.

---

## 1. Quarterly Security Review

### 1.1 Obiettivo

Verificare che i controlli di sicurezza, RLS, RBAC e hardening delle edge function siano integri e aggiornati. Ogni review produce un **report formale** con finding classificati per severità.

### 1.2 Checklist obbligatoria

| # | Area | Verifica | Owner |
|---|------|----------|-------|
| R1 | **RLS Coverage** | 100% tabelle pubbliche con policy non-permissive | Engineering |
| R2 | **RBAC Integrity** | Nessun ruolo orfano; `user_roles` coerente con `auth.users` | Engineering |
| R3 | **Edge Function Auth** | Nessuna function accetta `role=anon` su endpoint privilegiati | Engineering |
| R4 | **Secret Rotation** | Tutti i secret con età > 90gg segnalati; rotazione completata | Engineering |
| R5 | **Webhook HMAC** | Tutti gli endpoint outbound usano HMAC-SHA256 valido | Engineering |
| R6 | **API Key Exposure** | Nessuna chiave privata in log, URL path o query string | Engineering |
| R7 | **Dependency Audit** | Zero vulnerabilità high/critical in `npm audit` | Engineering |
| R8 | **Brand Isolation** | Test cross-brand: utente brand A non accede a dati brand B | Engineering |
| R9 | **Audit Log** | Tutti i trigger attivi; log non vuoti per entities critiche | CX Ops |
| R10 | **Permessi Override** | Override granulari (Allow/Deny) consistenti con policy | CX Ops |

### 1.3 Processo

1. **Kick-off** (giorno 1): Engineering Lead apre review nel sistema, assegna owner per area.
2. **Esecuzione** (giorni 2-5): ogni owner esegue le verifiche e registra finding.
3. **Report** (giorno 5): revisione collegiale dei finding; classificazione severity (critical/high/medium/low).
4. **Remediation** (entro fine trimestre): ogni finding critical/high deve avere PR merged.
5. **Sign-off**: CEO/CTO firma il report su dashboard.

### 1.4 Severità Finding

| Severity | Definizione | SLA Remediation |
|----------|-------------|-----------------|
| **Critical** | Bypass auth, data leak cross-tenant | 48h |
| **High** | Privilege escalation, missing RLS | 1 settimana |
| **Medium** | Config weakness, logging gap | Fine trimestre |
| **Low** | Best practice mancante, tech debt | Backlog |

---

## 2. Incident Drill

### 2.1 Obiettivo

Simulare scenari di incidente reale per verificare readiness operativa, tempi di risposta e correttezza delle procedure di escalation.

### 2.2 Scenari standard

| ID | Scenario | Tipo | Owner |
|----|----------|------|-------|
| D1 | **Webhook Ingest Down** | Availability | Engineering |
| D2 | **SLA Breach Storm** | Volume spike | CX Ops |
| D3 | **Data Leak Cross-Brand** | Security | Engineering |
| D4 | **DLQ Overflow** | Reliability | Engineering |
| D5 | **AI Classification Failure** | Service degradation | Engineering + CX Ops |
| D6 | **Unauthorized Admin Access** | Auth breach | Engineering |

### 2.3 Formato Drill

1. **Preparazione** (1h prima): facilitatore prepara scenario, inietta dati di test in staging-sandbox.
2. **Esecuzione** (time-boxed 60 min):
   - T+0: Alert simulato (notification/Slack).
   - Team identifica, diagnostica, mitiga.
   - Facilitatore osserva e registra timeline.
3. **Debrief** (30 min post-drill):
   - Cosa ha funzionato?
   - Dove siamo stati lenti?
   - Action item per miglioramento.

### 2.4 Metriche Drill

| Metrica | Target | Descrizione |
|---------|--------|-------------|
| **Time to Detect (TTD)** | ≤ 5 min | Tempo da alert a prima risposta |
| **Time to Mitigate (TTM)** | ≤ 30 min | Tempo da detect a mitigazione |
| **Escalation Accuracy** | 100% | Escalation al team corretto |
| **Runbook Followed** | ≥ 90% | Percentuale step del runbook eseguiti |

### 2.5 Cadenza

- **Q1 & Q3**: Security-focused drill (D3, D6)
- **Q2 & Q4**: Reliability-focused drill (D1, D2, D4)
- Scenario D5 almeno 1 volta/anno

---

## 3. Governance

- I risultati di review e drill sono tracciati nella tabella `security_reviews` / `incident_drills` e visibili in `/admin/security-reviews`.
- Ogni finding aperto è linkato al `security_findings` con stato e remediation tracking.
- Il report trimestrale è incluso nel QBR Enterprise (vedi `docs/qbr-enterprise.md`).
- La dashboard SLO Board (`/admin/slo-board`) mostra lo stato aggregato.

---

## 4. Template Report

```
## Security Review Q[N] 20XX

**Periodo**: [data inizio] – [data fine]
**Reviewer**: [nome]
**Status**: Draft / In Review / Signed Off

### Summary
- Finding totali: X (Critical: Y, High: Z, Medium: W, Low: V)
- Remediation completate: N/X
- Nuovi rischi identificati: ...

### Finding Detail
| # | Severity | Area | Descrizione | Status | Owner | PR |
|---|----------|------|-------------|--------|-------|----|
| 1 | ... | ... | ... | ... | ... | ... |

### Drill Results
| Scenario | TTD | TTM | Escalation OK | Note |
|----------|-----|-----|---------------|------|
| ... | ... | ... | ... | ... |

### Sign-off
- [ ] Engineering Lead
- [ ] CTO/CEO
```
