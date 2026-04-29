# MCP Server — Threat Model (STRIDE)

> Asset: edge function `mcp-server` esposta a client AI esterni (Claude Desktop, Cursor, n8n) via Streamable HTTP / JSON-RPC 2.0.
> Owner: Engineering Lead. Cadenza review: ad ogni release maggiore o trimestralmente.

---

## 1. Scope & Trust Boundaries

```
┌──────────────────┐    HTTPS + Bearer mcp_xxx     ┌──────────────────┐
│ External AI      │ ────────────────────────────▶ │ mcp-server       │
│ (Claude, Cursor, │                                │ (edge function)  │
│  n8n, custom)    │                                └────────┬─────────┘
└──────────────────┘                                         │ x-mcp-internal
                                                             ▼
                                                    ┌──────────────────┐
                                                    │ mcp-gateway      │
                                                    │ (policy engine)  │
                                                    └────────┬─────────┘
                                                             ▼
                                                    ┌──────────────────┐
                                                    │ Postgres + RLS   │
                                                    └──────────────────┘
```

**Trust boundaries:**
- B1: Internet → mcp-server (untrusted)
- B2: mcp-server → mcp-gateway (service-to-service, INTERNAL_SERVICE_TOKEN + x-mcp-internal)
- B3: mcp-gateway → DB (service role, RLS bypass per RPC dedicate)

---

## 2. STRIDE Analysis

| ID | Threat | Categoria | Vector | Mitigazione | Stato |
|----|--------|-----------|--------|-------------|-------|
| **T1** | Token leak via log | Information Disclosure | Token nel path/query, log non filtrati | Bearer header only; `mcp_request_log` salva solo `token_id` (UUID), mai il token raw | ✅ |
| **T2** | Replay token revocato | Spoofing | Token compromesso usato dopo revoca | `validate_mcp_token` controlla `revoked_at IS NULL` ad ogni richiesta (no caching) | ✅ |
| **T3** | Privilege escalation via scope | Elevation of Privilege | Token user-scope chiama tool admin | `mcp_list_tools_for_scopes` filtra catalog; gateway rivaluta policy con role del token | ✅ |
| **T4** | DoS / token abuse | Denial of Service | Burst di richieste su singolo token | `mcp_check_rate_limit` (60/min default) → HTTP 429 | ✅ |
| **T5** | DoS globale | Denial of Service | Compromissione di più token | Kill-switch globale (`mcp_servers.kill_switch`) → HTTP 503 | ✅ |
| **T6** | PII leak in tool response | Information Disclosure | Tool restituisce email/phone non mascherati | Redaction policy (vedi §4); gateway applica `applyMask` su campi sensibili | ✅ |
| **T7** | Cross-tenant access | Information Disclosure | Token brand A legge dati brand B | Token bound a `user_id` → RLS via `get_user_id(auth.uid())` + brand filter | ✅ |
| **T8** | Idempotency replay | Tampering | Stesso write tool eseguito 2x | `idempotency_key` auto-generato per write; gateway dedup 24h | ✅ |
| **T9** | Approval bypass | Elevation of Privilege | Sensitive write senza approvazione | Gateway forza `pending_approval` per `category=sensitive_write`; server NON può saltare | ✅ |
| **T10** | Service token leak | Spoofing | INTERNAL_SERVICE_TOKEN compromesso | Stored in Supabase secrets; rotazione trimestrale; mai esposto a client | ✅ |
| **T11** | JSON-RPC injection | Tampering | Parametri malformati causano crash | Zod validation su `tools/call` arguments; try/catch globale; HTTP 422 | ✅ |
| **T12** | Audit log tampering | Repudiation | Eliminazione log per coprire abuso | `mcp_request_log` append-only (no UPDATE/DELETE policy per non-admin); SIEM export | ✅ |
| **T13** | Side-channel via timing | Information Disclosure | Distinguere token validi da invalidi | `validate_mcp_token` esegue hash SHA-256 sempre, anche su token inesistenti | ⚠️ Parziale |
| **T14** | Resource enumeration | Information Disclosure | Listing risorse rivela esistenza dati | `resources/list` filtrato per scope; URI templates non leakano IDs | ✅ |

---

## 3. Risk Matrix

| Threat | Likelihood | Impact | Risk |
|--------|-----------|--------|------|
| T1, T6, T7 | Low | Critical | **Medium** |
| T2, T3, T9 | Low | High | **Medium** |
| T4, T5 | Medium | Medium | **Medium** |
| T8, T10, T11, T12 | Low | Medium | **Low** |
| T13, T14 | Low | Low | **Low** |

---

## 4. Redaction Policy (riassunto, vedi `docs/mcp-server-redaction-policy.md`)

- Tool response passa per `resolveStrategy` (`src/lib/piiMasking.ts`).
- Campi obbligatori mask su token con scope ≠ `pii.read`:
  - `email` → `partial`
  - `phone`, `phone_e164` → `partial` (mostra ultime 4 cifre)
  - `fiscal_code`, `vat_number` → `full`
  - `address`, `city` → `partial` se non in scope `address.read`
- Scope speciali (richiedono approvazione esplicita admin):
  - `pii.read.full` → disabilita masking
  - `pii.export` → consente bulk export (audit obbligatorio)

---

## 5. Open Risks & Action Items

| Item | Owner | Deadline |
|------|-------|----------|
| T13: irrobustire timing constant per `validate_mcp_token` | Engineering | Q3 2026 |
| Pen test esterno applicativo | Security vendor | Q3 2026 |
| Implementare rotation automatica per token long-lived (>90gg) | Engineering | Q4 2026 |
| SBOM diff vs ultima release in CI | DevOps | Q3 2026 |

---

## 6. Sign-off

| Ruolo | Nome | Data |
|-------|------|------|
| Engineering Lead | _____ | _____ |
| Security Reviewer | _____ | _____ |
| CTO/CEO | _____ | _____ |
