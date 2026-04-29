# MCP Server — PII Redaction Policy

> Owner: Engineering + Compliance. Allineato a `src/lib/piiMasking.ts` e alle policy `audit_pii_policies`.

---

## 1. Principio

Ogni risposta dei tool/resources MCP esposti a client esterni passa per uno strato di **masking** prima di lasciare la trust boundary. Il masking è applicato dal `mcp-gateway` sui dati di output, **non** dal server (che è solo un proxy di trasporto).

## 2. Campi sensibili (tassonomia)

| Categoria | Field pattern (case-insensitive contains) | Strategia default | Scope override |
|-----------|-------------------------------------------|-------------------|----------------|
| **Identità** | `email`, `email_address` | `partial` (j***@example.com) | `pii.read` |
| **Contatto** | `phone`, `phone_e164`, `mobile`, `whatsapp` | `partial` (••• ••• 1234) | `pii.read` |
| **Fiscale** | `fiscal_code`, `codice_fiscale`, `vat`, `vat_number`, `partita_iva`, `ssn` | `full` (••••••••) | `pii.read.full` |
| **Anagrafica** | `birth_date`, `data_nascita` | `full` | `pii.read` |
| **Indirizzo** | `address`, `street`, `via`, `cap`, `zip`, `postal_code` | `partial` | `address.read` |
| **Pagamento** | `iban`, `card_number`, `card_pan` | `full` | `payments.read.full` (mai esposto via MCP esterno) |
| **Sanitario** | `patient_id`, `medical_*`, `clinical_topic` | `full` | `health.read` (richiede DPA) |
| **Auth** | `password*`, `token*`, `api_key*`, `secret*` | `full` (sempre, no override) | nessuno |

## 3. Scope MCP (mappa)

| Scope | Permette | Note |
|-------|----------|------|
| `crm.read` | Lettura entità con masking default | Scope di base |
| `crm.write` | Write operations (require approval per sensitive) | — |
| `pii.read` | Disabilita mask `partial` su email/phone | Audit obbligatorio |
| `pii.read.full` | Disabilita anche `full` mask (escluso auth secrets) | Solo admin, approval per ogni token |
| `address.read` | Mostra indirizzo completo | — |
| `pii.export` | Consente export bulk (>100 record) | Trigger alert SIEM |

## 4. Implementazione

```ts
// gateway, prima di restituire result al server
import { resolveStrategy, applyMask } from "@/lib/piiMasking";

function redactDeep(obj: unknown, scopes: string[]): unknown {
  if (Array.isArray(obj)) return obj.map(o => redactDeep(o, scopes));
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const strategy = resolveStrategyForScope(k, scopes);
      out[k] = strategy === "none" 
        ? redactDeep(v, scopes) 
        : applyMask(v, strategy);
    }
    return out;
  }
  return obj;
}
```

## 5. Audit & Telemetry

Ogni masking applicato è contato in `mcp_request_log.metadata.redactions_count`. Soglia anomala (>1000 redactions in 1h da singolo token) genera alert SIEM categoria `pii.high_volume`.

## 6. Test obbligatori (release gate)

- [ ] Test unit `redactDeep` su payload reale (contatto + deal)
- [ ] Test integration: token senza `pii.read` riceve email mascherata
- [ ] Test integration: token con `pii.read.full` riceve dati raw (con audit log entry)
- [ ] Pen test: tentativo di scope upgrade via param injection

## 7. Eccezioni & Deroghe

Eccezioni vanno richieste via PR su questo file con approvazione di:
- Engineering Lead
- DPO / Compliance
- CTO/CEO (per categorie `Sanitario` e `Pagamento`)
