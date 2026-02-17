# Zero-Exception Policy

> Nessuna eccezione ai gate di qualità. Nessun override manuale. Nessun workaround.

---

## Principio

Ogni rilascio in produzione **deve** superare tutti i gate automatici e manuali senza eccezioni. Non esistono "merge d'emergenza", "hotfix senza test", o "deploy fuori pipeline".

**Se un gate è rosso, il merge è bloccato. Punto.**

---

## 1. Gate Bloccanti (Zero Override)

### 1.1 CI Automatici — PR Merge

Ogni PR verso `main` **deve** superare tutti i seguenti step. Nessuno è bypassabile.

| # | Gate | Workflow | Conseguenza se rosso |
|---|------|----------|---------------------|
| G1 | `npm ci` (install) | `e2e-gate.yml` | ❌ Merge bloccato |
| G2 | `tsc --noEmit` (type check) | `e2e-gate.yml` | ❌ Merge bloccato |
| G3 | `npm run build` (production build) | `e2e-gate.yml` | ❌ Merge bloccato |
| G4 | `vitest run` (unit + smoke test) | `e2e-gate.yml` | ❌ Merge bloccato |
| G5 | `playwright test smoke` (E2E smoke) | `e2e-gate.yml` | ❌ Merge bloccato |
| G6 | `playwright test feature` (E2E RBAC + feature) | `e2e-gate.yml` | ❌ Merge bloccato |
| G7 | Secret scan (no leaked credentials) | `secrets-scan.yml` | ❌ Merge bloccato |

### 1.2 Review Umana — PR Approval

| # | Gate | Fonte | Conseguenza |
|---|------|-------|-------------|
| R1 | PR review checklist completata | `docs/domain-ownership.md` | ❌ Approval bloccata |
| R2 | Domain owner ha approvato | Label `domain:*` | ❌ Merge bloccato |
| R3 | Cross-cutting → Core review | File in lista cross-cutting | ❌ Merge bloccato |

### 1.3 Pre-Release — Go/No-Go

| # | Gate | Soglia | Conseguenza |
|---|------|--------|-------------|
| P1 | P1 bug count | = 0 | ❌ Release bloccata |
| P2 | Regressioni RBAC | = 0 | ❌ Release bloccata |
| P3 | Secret scan clean | 100% | ❌ Release bloccata |
| P4 | DB linter clean | 0 warnings | ❌ Release bloccata |
| P5 | Changelog aggiornato | Entry presente | ❌ Release bloccata |

---

## 2. Isolamento Ambienti (Zero Contaminazione)

| Regola | Enforcement | Violazione = |
|--------|-------------|-------------|
| **MAI** eseguire E2E su dati produzione | `.env.e2e` separato, seed deterministici | 🔴 Incident P0 |
| **MAI** puntare webhook test a endpoint reali | Mock receiver obbligatorio in CI | 🔴 Incident P0 |
| **MAI** usare credenziali produzione in test | GitHub Secrets isolati per CI | 🔴 Incident P0 |
| **MAI** committare `.env` con secret reali | `secrets-scan.yml` bloccante | 🔴 PR rifiutata |
| Brand test **non deve** esistere in produzione | Seed con UUID deterministici | Audit trimestrale |
| Dati produzione **mai** copiati in sandbox | Nessun `pg_dump` da prod a test | 🔴 Incident P0 |

---

## 3. Escalation per Eccezioni

Non esistono eccezioni, ma esiste un processo per situazioni critiche:

### "Ma è urgente!"

```
┌─────────────────────────────────────────────┐
│  "Devo mergiare senza CI verde"             │
│                                             │
│  ❌ NO. Fix il test, poi mergia.            │
│                                             │
│  Se il test è flaky:                        │
│  1. Apri issue con label `flaky-test`       │
│  2. Fix il test PRIMA del feature merge     │
│  3. Se il fix richiede >4h → skip il test   │
│     specifico con `test.skip()` + issue     │
│     tracciata (max 48h per riabilitarlo)    │
│                                             │
│  Se è un hotfix critico (P0 in prod):       │
│  1. Crea branch `hotfix/xxx`                │
│  2. CI DEVE comunque passare               │
│  3. Se CI non passa → il fix non è pronto  │
│  4. Deploy solo dopo CI verde               │
│                                             │
│  Zero eccezioni. Zero override.             │
└─────────────────────────────────────────────┘
```

### Flaky Test Policy

| Situazione | Azione | SLA |
|------------|--------|-----|
| Test flaky rilevato | `test.skip()` + issue `flaky-test` | Fix entro 48h |
| Test skippato > 48h | Escalation a Engineering Lead | Obbligo fix sprint corrente |
| Test skippato > 1 settimana | 🔴 P1 — blocca nuove feature | Fix prima di qualsiasi altro lavoro |

---

## 4. Violazioni e Conseguenze

| Violazione | Severità | Azione |
|------------|----------|--------|
| Merge con CI rosso (se bypass abilitato) | 🔴 P0 | Revert immediato + post-mortem |
| Release con P1 aperti | 🔴 P0 | Rollback + post-mortem |
| Test su dati produzione | 🔴 P0 | Incident response immediato |
| Secret committato in repo | 🔴 P0 | Rotazione immediata + post-mortem |
| PR senza review checklist | 🟡 P2 | Revert e re-review |
| Changelog non aggiornato | 🟡 P3 | Blocco prossima release fino a fix |

---

## 5. Verifica Compliance

| Frequenza | Check | Responsabile |
|-----------|-------|-------------|
| **Per PR** | CI gate + review checklist | Automatico + Reviewer |
| **Per release** | Go/No-Go board (§1.3) | Engineering Lead |
| **Settimanale** | Flaky test count, skip count | Tech Lead |
| **Trimestrale (QBR)** | Compliance report, eccezioni log | Engineering Lead |

### Metriche di compliance

| Metrica | Target | Significato |
|---------|--------|-------------|
| CI bypass count | 0 | Nessun merge senza CI verde |
| Flaky test backlog | ≤ 2 | Test skippati sotto controllo |
| P1 at release time | 0 | Nessuna release con bug critici |
| Env isolation violations | 0 | Nessun test su dati prod |
| Secret leak incidents | 0 | Nessun secret in repo |

---

## Riferimenti

| Documento | Sezione rilevante |
|-----------|------------------|
| [`docs/sandbox-strategy.md`](./sandbox-strategy.md) | Go/No-Go board, isolamento ambienti |
| [`docs/rbac-assurance.md`](./rbac-assurance.md) | Audit RBAC, incident response |
| [`docs/domain-ownership.md`](./domain-ownership.md) | PR review checklist |
| [`docs/qbr-enterprise.md`](./qbr-enterprise.md) | Compliance trimestrale |
| [`.github/workflows/e2e-gate.yml`](../.github/workflows/e2e-gate.yml) | CI gate automatici |
| [`.github/workflows/secrets-scan.yml`](../.github/workflows/secrets-scan.yml) | Secret scan |
