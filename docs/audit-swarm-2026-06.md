# Due Diligence Tecnica — Swarm Audit

**Data:** 2026-06-08
**Metodo:** 4 agenti paralleli (Architettura/Codice, Sicurezza/DevOps, Frontend/Performance, QA/AI/DB/Prodotto) su codice reale (grep, conteggi, lettura file). Nessuna stima non verificata.

---

## 0. Metriche di base

| Metrica | Valore |
|---|---|
| File TS/TSX in `src` | 774 (~153k LOC) |
| Componenti React | 412 |
| Hook | 168 (cartella piatta) |
| Edge functions | 93-94 (~38k LOC) |
| Migrazioni SQL | 468 (~54k LOC) |
| Tabelle pubbliche (stima) | ~218 |
| Funzioni `SECURITY DEFINER` | ~305 |
| Job `cron.schedule` | 64 |
| Test unit/component (Vitest) | 33 |
| Test edge (Deno) | 15 |
| Test SQL e2e | 12 |
| Spec Playwright | 8 |
| Dipendenze | 65 prod + 23 dev |

---

## 1. Executive Summary

Piattaforma matura sul piano **operativo e di sicurezza** (SSRF guard production-grade, CORS senza wildcard+credentials, 11 guard CI custom, retention policy con ADR, RLS diffusa, hash-chain audit), ma con **due debiti sistemici**: tipizzazione non strict e copertura test frontend quasi nulla su una superficie di 412 componenti. L'architettura è in transizione incompleta verso `features/` (2 domini su ~30) e presenta duplicazione significativa lato edge (CORS ripetuto in 84 funzioni, 9 funzioni Sheets-export). Il rischio più alto non è una vulnerabilità puntuale ma la **superficie non verificabile**: 305 `SECURITY DEFINER` e ~50 funzioni con `verify_jwt=false` la cui correttezza dipende da ogni singolo handler, senza gate automatico dedicato.

### Voti

| Area | Voto |
|---|---|
| Sicurezza | 8/10 |
| DevOps / CI | 8/10 |
| Performance | 7.5/10 |
| UX / Frontend | 7/10 |
| AI workflow | 6/10 |
| Documentazione | 6/10 |
| Scalabilità | 5/10 |
| Testing | 4/10 |
| **Media ponderata** | **~6.5/10** |

---

## 2. Cosa funziona bene (da non toccare)

- `supabase/functions/_shared/`: 30 moduli (crypto, rate-limit, circuit-breaker, idempotency, pii-redact, safe-outbound, mtls) — qualità enterprise.
- `useGlobalRealtime`: dedup ring-buffer, invalidazione per tabella, backoff, fallback polling, catch-up su visibility/online.
- Code splitting: ~75 route lazy vs 5 eager, `manualChunks` vendor, `ChunkLoadErrorBoundary`, `sourcemap:false` con guard CI.
- PWA/Workbox con policy NetworkOnly su tutte le rotte Supabase sensibili.
- Gate CI realmente bloccanti: `tsc --noEmit`, `build`, `vitest`, Playwright `@revenue-critical`.
- Guard CI su misura: retention (ADR-001), types drift, soft-delete RLS, edge config completeness, SRI/i18n, sourcemaps, error leak.
- `docs/` ampia e specifica (threat model, DR runbook, RBAC assurance, migration policy).
- `ai-quota.ts` fail-closed + `ai-output-validate.ts` con Zod `.strict()`.

---

## 3. Top problemi per priorità

### Critical

| # | Problema | Evidenza | Fix | Stima |
|---|---|---|---|---|
| C1 | `strict:false` + `noImplicitAny:false` su tutta l'app | `tsconfig.app.json:9,16` | Migrazione incrementale file-by-file (piano già in `docs/typescript-strict-migration.md`) | 3-5 gg |
| C2 | Copertura test frontend ~4% (33 test / 742 file); 0 test su CRM, ticket, marketing, callcenter, pagamenti | `src/test/*` | Priorità su logica business + flussi pagamento | 1-2 sprint |

### High

| # | Problema | Evidenza | Fix | Stima |
|---|---|---|---|---|
| H1 | 305 `SECURITY DEFINER` senza audit automatico (`search_path`, grant minimi) | migrazioni | Script CI che verifica `SET search_path` + REVOKE PUBLIC su ogni SECDEF | 1-2 gg |
| H2 | CORS duplicato in 84 edge functions invece di `_shared/cors.ts` | `webhook-ingest:41`, `ai-classify:6`, `keplero-webhook:9` | Refactor + guard CI che vieta header CORS inline | 2 gg |
| H3 | `safe-error-response.ts` usato in 4/94 funzioni | grep | Estendere alle funzioni con superficie pubblica | 3 gg |
| H4 | Nessun gate ESLint bloccante in CI | `package.json:9`, nessun workflow lo invoca | Step `npm run lint` in `code-hygiene.yml` | 30 min |
| H5 | Nessuna virtualizzazione liste + fetch 1000 righe client-side | `useContacts.ts:12-31`, `ContactsTableWithViews.tsx` (836 righe) | Paginazione server `range()` + `@tanstack/react-virtual` | 1-2 gg |
| H6 | Componenti/funzioni monolitiche >900 LOC | `AdminDlqDashboard` 940, `UserManagementCard` 905, `automation-runner` 1243, `sheets-export` 1173 | Split in sub-componenti/handler | 2-3 gg cad. |
| H7 | Modelli AI "preview" in produzione (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`) | edge AI | Fallback dichiarato su modello stabile | 0.5 gg |
| H8 | 226 `any` con 52 file in ANY_BASELINE senza burn-down | `eslint.config.js` | Target di riduzione enforced in CI | continuo |

### Medium

| # | Problema | Fix | Stima |
|---|---|---|---|
| M1 | `verify_jwt=false` su ~50 funzioni: correttezza per-handler, non centralizzata | Audit a campione (`ai-agent`, `admin-*`) + checklist | 4 h |
| M2 | 9 funzioni Sheets-export duplicate | Consolidare in una parametrica | 3-5 gg |
| M3 | Validazione solo strutturale (Zod) sugli output AI, non semantica (stage/tag inesistenti) | Verifica downstream contro DB | 1 gg |
| M4 | `src/features/` copre 2 domini su ~30; `hooks/` piatto (168 file) | Migrazione progressiva + namespacing | multi-sprint |
| M5 | 123 colori hardcoded in 28 file fuori design system | `chartColors.ts` da CSS vars | 1 gg |
| M6 | `staleTime` globale 60s uguale per tutti i dati | Per-query in base a volatilità | 0.5 gg |
| M7 | Migrazioni forward-only senza processo di rollback documentato | Procedura "migration di compensazione" in CONTRIBUTING | 2 h |
| M8 | 468 migrazioni con naming UUID opaco | Convenzione + hook CI (non retroattivo) | 0.5 gg |
| M9 | Token biometrico in `localStorage` in chiaro | Documentare one-shot/TTL o irrigidire storage | 3 h |
| M10 | a11y: `aria-*` solo nel 40% dei componenti | axe-core in CI su pagine chiave | 2-3 gg |
| M11 | Test SQL `scripts/tests/*.sql` non invocati da nessun workflow | Aggiungere job CI o declassarli a documentazione | 0.5 gg |
| M12 | 52 file con `console.*` diretti lato frontend | Logger centralizzato con redaction | 1 gg |
| M13 | ADR-001 retention non retroattiva su tabelle log storiche | Estendere retention alle tabelle pre-policy | 1 gg |

### Low

- `manualChunks` senza raggruppamento pagine `Admin*` (30+ chunk piccoli).
- Nessun prefetch su hover per pagine pesanti.
- Banner assente quando `useContacts` tronca a 1000 righe (oggi solo `console.warn`).
- 2 `@ts-ignore` isolati; naming catch incoerente (`e`/`err`/`error`).
- `mobile-redesign/` e `.workspace/.git` annidati non documentati.
- `npm audit` non verificabile per registry proxato: confermare in CI reale o passare a osv-scanner.

---

## 4. Rischi futuri

1. **Manutenzione**: 100+ edge function con duplicazione strutturale + 468 migrazioni + frontend poco modularizzato → costo di onboarding e refactor in crescita non lineare.
2. **Sicurezza strutturale**: 305 SECDEF + 50 `verify_jwt=false` → superficie non coperta dai gate CI attuali.
3. **Costi AI**: modelli preview senza fallback e senza dashboard costi aggregata in valuta.
4. **Crescita dati**: 64 cron (incluso `process-email-queue` ogni minuto) + tabelle audit/log storiche fuori retention.
5. **Regressioni silenziose**: senza test su CRM/ticket/pagamenti, un refactor su componenti da 900 LOC non ha rete di sicurezza.

---

## 5. Checklist operativa (ordine consigliato)

**Sprint 1 — quick win ad alto rapporto valore/costo**
- [ ] Gate ESLint bloccante in CI (30 min)
- [ ] Verificare che `code-hygiene`, `secrets-scan`, `e2e-gate` siano *required* su branch protection (15 min)
- [ ] Fallback su modello AI stabile al posto dei preview (0.5 gg)
- [ ] Script CI di audit `SECURITY DEFINER` (search_path + grant) (1-2 gg)
- [ ] Decidere destino di `scripts/tests/*.sql`: in CI o documentazione (0.5 gg)
- [ ] Procedura rollback migrazioni in CONTRIBUTING (2 h)

**Sprint 2 — debito strutturale**
- [ ] Refactor CORS su `_shared/cors.ts` + guard CI anti-inline (2 gg)
- [ ] Estendere `safe-error-response` alle funzioni pubbliche (3 gg)
- [ ] Paginazione server + virtualizzazione tabella contatti (1-2 gg)
- [ ] Split dei 4 componenti e 4 edge function >900 LOC (2 settimane)

**Sprint 3+ — fondamenta**
- [ ] Migrazione TypeScript strict incrementale + burn-down `any`
- [ ] Test su flussi pagamento e moduli CRM/ticket
- [ ] Consolidamento 9 funzioni Sheets-export
- [ ] Centralizzazione palette chart + audit a11y con axe-core in CI
