# Release Changelog

> Registro formale di ogni rilascio in produzione.  
> Ogni entry richiede: owner, data, evidenze QA, esito go/no-go.

---

## Template Entry

```
### vX.Y.Z — YYYY-MM-DD

**Owner:** Nome Cognome  
**Go/No-Go:** 🟢 GO | 🔴 NO-GO  

#### Modifiche
- [ ] Descrizione modifica 1
- [ ] Descrizione modifica 2

#### Evidenze QA
| Metrica | Risultato | Soglia |
|---------|-----------|--------|
| Install | ✅ | 100% |
| Build | ✅ | 100% |
| Smoke pass | XX% | ≥ 95% |
| P1 bugs | 0 | 0 |
| RBAC regressions | 0 | 0 |
| Secret scan | ✅ | clean |

#### Note
- (eventuali caveat, rollback plan, hotfix)
```

---

## Rilasci

### v0.1.0 — 2025-06-01 (Bootstrap)

**Owner:** —  
**Go/No-Go:** 🟢 GO (primo deploy iniziale)

#### Modifiche
- Setup progetto React + Vite + Tailwind
- Integrazione Lovable Cloud (Supabase)
- Moduli core: Contacts, Pipeline, Tickets, Marketing, Settings
- CI: `e2e-gate.yml`, `secrets-scan.yml`
- Sandbox strategy + seed deterministici

#### Evidenze QA
| Metrica | Risultato | Soglia |
|---------|-----------|--------|
| Install | ✅ | 100% |
| Build | ✅ | 100% |
| Smoke pass | baseline | ≥ 95% |
| P1 bugs | 0 | 0 |
| RBAC regressions | 0 | 0 |
| Secret scan | ✅ | clean |

#### Note
- Primo rilascio, metriche baseline ancora in fase di raccolta.

---

## Riferimenti

- [`docs/sandbox-strategy.md`](./sandbox-strategy.md) — Go/No-Go board e metriche
- [`docs/slo-sla.md`](./slo-sla.md) — KPI C-Level
- [`.github/workflows/e2e-gate.yml`](../.github/workflows/e2e-gate.yml) — CI pipeline
- [`.github/workflows/secrets-scan.yml`](../.github/workflows/secrets-scan.yml) — Secret enforcement
