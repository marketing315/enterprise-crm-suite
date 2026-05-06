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

---

## 3. Code-Review Checklist — Hardening Audit Q2 2026 (H1–H14)

Da applicare in ogni PR che tocca edge function, OAuth, RLS o UI sensibile. **Bocciare** il PR se una di queste regole è violata.

### Edge functions

- **H1 — IP rate-limit su webhook pubblici.** Ogni nuova edge function con `verify_jwt = false` esposta a internet (webhook ingest, callback OAuth, health-check) DEVE importare `_shared/ip-rate-limit.ts` come **prima riga** del handler. Lo script `scripts/ci/check-public-webhooks-ratelimit.sh` **auto-enumera** ora tutte le funzioni `verify_jwt=false` da `supabase/config.toml` e fallisce se la nuova funzione non è (a) wired al rate-limit oppure (b) elencata in `PUBLIC_WEBHOOKS_EXEMPT` con motivazione (INTERNAL / CLIENT_AUTH_IN_CODE / HMAC_PROTECTED / ADMIN_ONLY). Aggiungere a `PUBLIC_WEBHOOKS_TODO` solo se il rate-limit è pianificato ma non ancora wired (warning, non errore).
- **H3 — CSP su edge che serve HTML.** Se la response ha `Content-Type: text/html` (es. OAuth callback, landing email-confirm), DEVE usare `SECURE_HTML_HEADERS` da `_shared/secure-html.ts`. Nessuna eccezione: anche pagine "innocue" devono avere CSP strict + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer`.
- **H5 — mTLS interno.** Ogni nuova chiamata edge → edge DEVE usare `signInternalRequest()` di `_shared/internal-mtls.ts`. La legacy `x-internal-token` è in deprecation con TODO target **Q3 2026**: non aggiungerla in codice nuovo.
- **H6 — Niente PII negli error response.** Vietato `return new Response(JSON.stringify({ error: err.message }), …)`. Sempre `safeErrorResponse(err)` da `_shared/safe-error-response.ts`. CI guard baseline-aware in `scripts/ci/check-edge-error-leak.sh`: nuove violazioni bloccano il merge.
- **H13 — List-Unsubscribe + suppression.** Nuovi template in `_shared/transactional-email-templates/` DEVONO passare per `send-transactional-email/index.ts` che inietta `List-Unsubscribe` (RFC 2369) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Anche le email puramente transazionali dovrebbero averlo per evitare warning Gmail/Outlook. Il check `email_suppression` DEVE restare **fail-closed** (errore RPC ⇒ NON inviare).

### OAuth / Vault

- **H2 — Token OAuth in Vault.** Nuove integrazioni OAuth (LinkedIn, TikTok, ecc.) DEVONO seguire il pattern `meta_apps_*` / `oauth_tokens`: tabella con colonna `*_secret_id uuid REFERENCES vault.secrets`, **mai** `*_token text` o `*_encrypted text`. Se vedi una colonna del genere in un PR, **bocciare**.

### Frontend

- **H8 — Double-submit guard.** Ogni form che chiama una RPC mutativa DEVE avere `submitInFlightRef` (useRef) **+ UNIQUE constraint DB-side**. Pattern fragile da cercare in PR: `useState.*[Ss]ubmitting` o `disabled.*isSubmitting` **senza** ref accompagnato. Form attualmente a rischio: `QuickSaleDialog`, `NewDealDialog`, tutti i form di import.
- **H9 — i18n statico + SRI.** Il bundle i18n è statico, niente `loadPath` remoto. Se un PR propone di tornare a `i18next-http-backend` per "snellire il bundle", richiedere SRI hash + audit log su ogni fetch. La complessità non vale il vantaggio. CI guard: `scripts/ci/check-sri-and-i18n.mjs`.
- **H10 — Sourcemap off in prod.** `build.sourcemap = false` in `vite.config.ts`. Se serve debugging in prod, alternativa: hidden source maps caricate **solo a Sentry**, mai servite al client. **Mai accettare** PR che imposta `sourcemap: true` per "prod debugging veloce". CI guard: `scripts/ci/check-sourcemaps.mjs`.
- **H11 — Accessibility regression.** Per ogni nuovo componente in `src/components/ui/` o `src/components/forms/` aggiungere un test `expect(container).toHaveNoViolations()` con fixtures plausibili. Pre-audit WCAG esterno, CI deve coprire almeno: button, input, label, form, modal, tabs, table.
- **H12 — Driver.js auth guard.** Ogni nuovo `AppTour` o tour parziale DEVE applicare `isAuthenticated + hasBrandSelected` + re-check post-defer. Se il tour parte da pagine pubbliche (login, password reset) aggiungere un terzo guard che escluda quelle route.

### Database / AI

- **H4 — Soft-delete in RLS SELECT.** Le SELECT policy su tabelle PII (`contacts`, `lead_events`, `tickets`, `chat_threads`, `chat_messages`) DEVONO includere il filtro `archived = false` / `deleted_at IS NULL` / `merged_into_contact_id IS NULL` con override admin/CEO. CI guard: `scripts/ci/check-soft-delete-rls.sh`. Aggiungere nuove tabelle PII a `docs/soft-delete-tables.md`.
- **H14 — No raw_text AI persistito.** `parse-sale-document` (e ogni futura edge AI) DEVE forzare `response_format: json_schema strict` + validazione Zod (`_shared/ai-output-validate.ts`) e restituire **422** su non conformità. **Mai** aggiungere un campo `raw_text` in risposta o in tabella di destinazione. La colonna `incoming_requests.raw_body_text` è un'eccezione legittima (fallback webhook non-JSON, retention 90gg).

> Riferimenti completi: `docs/security-remediation-2026-q2.md` + memorie `mem://features/h{1..14}-*`.

