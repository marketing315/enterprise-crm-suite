# Data & RBAC Assurance Program

> Audit trimestrale + test automatici per garantire che RLS, ruoli e isolamento multi-tenant restino corretti nel tempo.

---

## 1. Scope

| Area | Cosa si verifica |
|------|-----------------|
| **RLS Policies** | Ogni tabella con dati utente/brand ha RLS abilitato e policy coerenti |
| **RBAC Roles** | I 7 ruoli canonici (`admin`, `ceo`, `amministrazione`, `responsabile_venditori`, `responsabile_callcenter`, `venditore`, `operatore_callcenter`) hanno accesso corretto |
| **Brand Isolation** | Utente brand A non vede dati brand B |
| **Sensitive Columns** | Password hash, API key, HMAC secret mai esposti via SELECT |
| **Cross-cutting** | `current_app_user_id()`, `user_belongs_to_brand()`, `has_role()` funzionano correttamente |

---

## 2. Audit Trimestrale (Manuale)

### Checklist

| # | Check | Query/Azione | Pass criteria |
|---|-------|-------------|---------------|
| 1 | Tutte le tabelle con `brand_id` hanno RLS | `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN (SELECT tablename FROM pg_tables WHERE rowsecurity=true);` | Lista vuota (escluse tabelle di config) |
| 2 | Nessuna policy `USING (true)` su tabelle sensibili | Revisione manuale `pg_policies` | Zero policy permissive su tabelle con PII |
| 3 | Tabelle con API key/secret usano view pubblica | Verificare che `webhook_endpoints`, `inbound_webhook_sources`, `meta_apps` abbiano view | View esiste, base table ha `USING (false)` o scoped |
| 4 | Ruoli legacy non usati in produzione | `SELECT DISTINCT role FROM user_roles WHERE role IN ('callcenter','sales');` | Zero righe |
| 5 | `user_belongs_to_brand` copre gerarchia | Test con utente parent brand → vede dati child | Accesso corretto |
| 6 | Venditori vedono solo propri deal | Login come venditore → query deals | Solo deal con `assigned_user_id = proprio ID` |
| 7 | Operatori vedono solo ticket del proprio brand | Login come operatore → query tickets | Solo ticket del brand assegnato |
| 8 | CEO vede tutti i brand | Login come CEO → query cross-brand | Dati di tutti i brand visibili |
| 9 | Admin non può escalare a CEO | Tentativo update `user_roles` via API | Rifiutato da RLS/Edge Function |
| 10 | Audit log registra modifiche critiche | Modifica appointment/deal → check `audit_log` | Entry presente con old/new value |

### Responsabile

- **Esecutore**: Domain owner `Core`
- **Frequenza**: Ogni 3 mesi (Q1: Gen, Q2: Apr, Q3: Lug, Q4: Ott)
- **Output**: Issue GitHub con risultati, label `audit:rbac`

---

## 3. Test Automatici RLS (CI)

### 3.1 Unit Test: Policy Contract

File: `src/test/rbac-policy.test.ts`

Verifica che le funzioni di sicurezza DB siano accessibili e rispondano correttamente:

```typescript
// Esempio struttura test
describe("RBAC Policy Contract", () => {
  it("current_app_user_id() returns null for unauthenticated");
  it("user_belongs_to_brand() returns false for wrong brand");
  it("has_role() returns false for non-existent role");
});
```

### 3.2 E2E Test: Cross-Brand Isolation

File: `e2e/rbac-isolation.spec.ts`

```typescript
// Esempio struttura test
describe("@smoke RBAC Isolation", () => {
  it("venditore sees only own deals");
  it("operatore sees only own brand tickets");
  it("unauthenticated user cannot access /pipeline");
  it("admin cannot see other admin's brand data");
});
```

### 3.3 DB Linter (CI)

Il linter Lovable Cloud (`supabase--linter`) viene eseguito:
- Ad ogni migration
- Nel workflow `e2e-gate` come step aggiuntivo

---

## 4. Matrice Accesso Attesa

| Risorsa | CEO | Admin | Amm. | Resp.Vend | Resp.CC | Venditore | Op.CC |
|---------|-----|-------|------|-----------|---------|-----------|-------|
| Tutti i brand | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deal (propri) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Deal (team) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Ticket (brand) | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Contatti (brand) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Marketing | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Finance/Budget | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings (brand) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User management | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* Admin: solo brand assegnati

---

## 5. Incident Response

Se un audit rivela una violazione:

| Severità | Definizione | Azione | SLA |
|----------|------------|--------|-----|
| **P0 Critical** | Dati cross-brand esposti | Hotfix immediato + notifica stakeholder | < 4h |
| **P1 High** | Policy mancante su tabella con PII | Fix in PR prioritaria | < 24h |
| **P2 Medium** | Policy troppo permissiva (non PII) | Fix nel prossimo sprint | < 1 settimana |
| **P3 Low** | Ruolo legacy ancora in uso | Cleanup pianificato | < 1 mese |

---

## 6. Changelog Audit

| Data | Auditor | Risultato | Note |
|------|---------|-----------|------|
| _da compilare_ | — | — | Primo audit da schedulare |
