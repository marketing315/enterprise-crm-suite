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

### v0.2.0 — 2026-02-17 (Governance & QA Hardening)

**Owner:** Tech Lead (da assegnare nominalmente al prossimo standup)  
**Go/No-Go:** 🟢 GO

#### Modifiche
- Sandbox strategy formalizzata (`docs/sandbox-strategy.md`)
- CI enforcement secret-scan attivo su ogni PR/push
- Go/No-Go board con 5 metriche bloccanti
- KPI C-Level integrati in `docs/slo-sla.md` (§4)
- Changelog formale + seed audit_log per QA
- Standardizzazione toolchain su `npm` (coerenza CI)
- Portfolio rationalization: 15 → 8 moduli attivi

#### Evidenze QA
| Metrica | Risultato | Soglia |
|---------|-----------|--------|
| Install | ✅ `npm ci` | 100% |
| Build | ✅ `tsc --noEmit` | 100% |
| Smoke pass | ✅ (E2E gate attivo) | ≥ 95% |
| P1 bugs | 0 | 0 |
| RBAC regressions | 0 | 0 |
| Secret scan | ✅ clean | clean |

#### Evidenze DB (audit reale)
| Dato | Valore |
|------|--------|
| Contatti in DB | 136 |
| Deal in DB | 136 |
| Audit log entries | 6 (pipeline_stage ×4, appointment ×1, pipeline_stages ×1) |
| Prima entry audit | 2026-01-30 |
| Ultima entry audit | 2026-02-03 |

#### Note
- Owner nominale da confermare al prossimo sync di team.
- Audit_log funzionante: registra correttamente create/deactivated/reordered su pipeline e appointment.
- Seed `scripts/seed-e2e-audit-log.sql` disponibile per validazione E2E.

---

### v0.1.0 — 2025-06-01 (Bootstrap)

**Owner:** —  
**Go/No-Go:** 🟢 GO (primo deploy iniziale)

#### Modifiche
- Setup progetto React + Vite + Tailwind
- Integrazione Lovable Cloud
- Moduli core: Contacts, Pipeline, Tickets, Marketing, Settings
- CI: `e2e-gate.yml`, `secrets-scan.yml`

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
- Primo rilascio, metriche baseline.

---

## Riferimenti

- [`docs/sandbox-strategy.md`](./sandbox-strategy.md) — Go/No-Go board e metriche
- [`docs/slo-sla.md`](./slo-sla.md) — KPI C-Level
- [`.github/workflows/e2e-gate.yml`](../.github/workflows/e2e-gate.yml) — CI pipeline
- [`.github/workflows/secrets-scan.yml`](../.github/workflows/secrets-scan.yml) — Secret enforcement
