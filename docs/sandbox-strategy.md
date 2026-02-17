# Sandbox Strategy

> Ambiente isolato per test, QA e validazione pre-release.  
> Obiettivo: zero contaminazione produzione, seed deterministico, go/no-go oggettivo.

---

## 1. Ambiente Staging-Sandbox

### Principi

| Regola | Dettaglio |
|--------|-----------|
| **Isolamento DB** | Nessun dato produzione nel sandbox; brand e utenti test dedicati |
| **Dataset sintetico** | Seed SQL deterministici per scenari riproducibili |
| **Credenziali separate** | `.env.e2e` con credenziali test, mai committato |
| **Nessun side-effect** | Webhook mockati, nessuna chiamata a API esterne reali |

### Setup rapido

```bash
# 1. Copia env di test
cp .env.e2e.example .env.e2e
# → Compila E2E_EMAIL, E2E_PASSWORD, E2E_BRAND_NAME

# 2. Seed deterministico
psql "$DATABASE_URL" -f scripts/seed-e2e-sla-breach.sql
psql "$DATABASE_URL" -f scripts/seed-e2e-inbound-source.sql

# 3. (Opzionale) Performance seed
psql "$DATABASE_URL" -f scripts/seed-performance-test.sql
```

---

## 2. Variabili Ambiente

| File | Scopo | In git? |
|------|-------|---------|
| `.env.e2e.example` | Template con valori placeholder | ✅ Sì |
| `.env.e2e` | Credenziali reali di test | ❌ No (`.gitignore`) |
| `.env` | Variabili Lovable Cloud (auto-gestito) | ❌ No |

### Variabili richieste in `.env.e2e`

```
E2E_EMAIL=        # Utente test admin
E2E_PASSWORD=     # Password utente test
E2E_BRAND_NAME=   # Brand demo isolato
PW_BASE_URL=      # URL preview/staging (opzionale)
DATABASE_URL=     # Connessione diretta per seed (CI only)
```

---

## 3. Seed Deterministico

| Script | Scopo | Idempotente? |
|--------|-------|:------------:|
| `seed-e2e-sla-breach.sql` | Ticket con SLA in breach per test alerting | ✅ |
| `seed-e2e-inbound-source.sql` | Sorgente inbound + chiave HMAC per test webhook | ✅ |
| `seed-performance-test.sql` | Dataset volumetrico per stress test | ✅ |

### Requisiti seed

- Ogni script **deve essere idempotente** (usa `ON CONFLICT` o `IF NOT EXISTS`)
- I dati seed usano UUID deterministici per referenze stabili nei test
- Il brand demo **non deve esistere in produzione**

---

## 4. Esecuzione Test E2E su Sandbox

### Locale

```bash
# Installa browser Playwright
npx playwright install --with-deps chromium

# Esegui contro dev server locale (auto-started)
npx playwright test

# Esegui contro preview/staging
PW_BASE_URL=https://id-preview--08e518ba-ca82-4402-9a5d-7fc159333e6d.lovable.app \
  npx playwright test
```

### CI (GitHub Actions)

```yaml
# Già configurato in .github/workflows/e2e-gate.yml
# Usa credenziali da GitHub Secrets
# Mock webhook receiver per test outbound
```

### Regole di sicurezza

- ❌ **MAI** eseguire E2E su dati produzione
- ❌ **MAI** puntare webhook test a endpoint reali
- ✅ Usare mock receiver (`scripts/mock-webhook-receiver.js`) o httpbin
- ✅ Credenziali CI isolate in GitHub Secrets

---

## 5. Go/No-Go Board per Release

### Metriche minime pre-deploy

| # | Metrica | Soglia | Fonte |
|---|---------|--------|-------|
| 1 | **Install success** | 100% | `bun install` exit code |
| 2 | **Build success** | 100% | `bun run build` exit code |
| 3 | **Smoke test pass rate** | ≥ 95% | `e2e/smoke.spec.ts` |
| 4 | **P1 bug count** | 0 | Issue tracker / test results |
| 5 | **Regressioni RBAC** | 0 | `e2e/tickets.gate.spec.ts` + unit RBAC |

### Processo decisionale

```
┌─────────────────────────────────────────┐
│           CI Pipeline Complete          │
├─────────────────────────────────────────┤
│                                         │
│  Install ✅  Build ✅  Smoke ≥95% ✅   │
│  P1 = 0 ✅   RBAC = 0 ✅              │
│                                         │
│  ───────────── ALL PASS ──────────────  │
│  │                                      │
│  ▼                                      │
│  🟢 GO → Deploy to production          │
│                                         │
│  ───────── ANY FAIL ─────────────────   │
│  │                                      │
│  ▼                                      │
│  🔴 NO-GO → Fix + re-run pipeline      │
│                                         │
└─────────────────────────────────────────┘
```

### Checklist manuale (pre-deploy critico)

- [ ] Nessun secret hardcoded nel codebase
- [ ] RLS linter pulito (`supabase--linter`)
- [ ] Nessuna migrazione pending non reviewata
- [ ] Changelog aggiornato
- [ ] Stakeholder notificato

---

## 6. Review Cadence

| Frequenza | Azione |
|-----------|--------|
| **Ogni PR** | CI gate automatico (5 metriche) |
| **Settimanale** | Review seed freshness + test flakiness |
| **Mensile** | Audit credenziali sandbox, rotazione chiavi test |
| **Trimestrale** | Refresh completo dataset sintetico |

---

## Riferimenti

- [`docs/e2e-checklist.md`](./e2e-checklist.md) — Checklist pre-run dettagliata
- [`docs/platform-qa-checklist.md`](./platform-qa-checklist.md) — QA funzionale
- [`docs/rbac-assurance.md`](./rbac-assurance.md) — Audit RBAC
- [`.env.e2e.example`](../.env.e2e.example) — Template variabili test
