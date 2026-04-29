# MCP Server — Runbook Incident Response

> Owner on-call: Engineering. Escalation: CTO. Tempo di risposta target: TTD ≤ 5 min, TTM ≤ 30 min.

---

## SLO di riferimento

| Metrica | Target | Alert threshold | Page threshold |
|---------|--------|-----------------|----------------|
| Availability | 99.5% mensile | < 99.7% rolling 1h | < 99.0% rolling 1h |
| Latency p95 (tools/call) | < 2000 ms | > 3000 ms 5 min | > 5000 ms 5 min |
| Error rate | < 1% | > 2% 5 min | > 5% 5 min |
| Auth failure rate | < 5% | > 15% 5 min | > 30% 5 min (potenziale brute force) |
| Rate-limit hit rate | < 5% richieste | > 20% 1h | > 50% 1h |

Dashboard live: `/admin/mcp` (KPI 24h + log realtime).

---

## Scenario 1 — Latency / Error spike

**Sintomi**: `mcp_server_kpi.error_rate > 5%` o `latency_p95_ms > 5000`.

**Diagnosi (≤ 5 min)**
1. Apri `/admin/mcp` → tab **Top Errors**: identifica error code dominante.
2. Apri tab **Top Tools**: il problema è isolato a 1 tool o globale?
3. Controlla edge function logs: `supabase--edge_function_logs` su `mcp-server` e `mcp-gateway`.
4. Verifica `cloud_status` per stato infra.

**Mitigazione (≤ 30 min)**
- Se isolato a 1 tool → disable temporaneo via `mcp_tools.enabled = false`.
- Se globale e infra OK → attiva **kill-switch** dal dashboard (toggle nell'header).
- Se gateway down → fallback: server risponde `-32603 INTERNAL_ERROR` con messaggio generico.
- Apri post-mortem (`docs/dr/post-mortem-template.md`).

---

## Scenario 2 — Auth failure storm (potenziale brute force)

**Sintomi**: `auth_failures > 50` in 5 min, IP unico.

**Diagnosi**
1. `/admin/mcp` → tab **Request Log** filtra `auth_status='invalid'`.
2. Identifica `client_ip` ricorrente (se loggato).
3. Verifica se token specifico è target (token_id ricorrente in failure).

**Mitigazione**
- Rotate / revoke immediata di tutti i token sospetti via `revoke_mcp_token`.
- Se IP-based → blocca a livello edge (Cloudflare / WAF).
- Se globale → attiva kill-switch e notifica security team.
- Crea finding in `security_findings` (severity: high).

---

## Scenario 3 — Token leak sospetto

**Sintomi**: token usato da IP/User-Agent inattesi, volume anomalo, scope creep.

**Procedura immediata**
1. **Revoke** token via dashboard (`useMcpServerKpi` → revoke action).
2. Esporta `mcp_request_log` ultimi 30gg per quel `token_id` (per audit).
3. Notifica owner del token (`user_id` associato).
4. Apri incident ticket categoria `security/credential_compromise`.
5. Verifica se ci sono stati write completati: query `mcp_executions` con `decision='allow'`, `status='success'`, filtrati per quel token.
6. Se write su entità critiche → valuta rollback usando audit snapshots.

**Post-incident**
- Forza rotation di tutti i token dello stesso utente.
- Review policy che permettevano lo scope abusato.

---

## Scenario 4 — DLQ / Approval queue blocked

**Sintomi**: `mcp_approvals` con `decision IS NULL` e `created_at` > 24h ago.

**Diagnosi**
- `/admin/ai-actions` per vedere coda approvazioni.
- Verifica notifiche: gli approver hanno ricevuto?

**Mitigazione**
- Bulk approve/reject via dashboard se sono falsi positivi noti.
- Aumenta `expires_at` per richieste legittime in attesa.
- Se >100 pending → disabilita temporaneamente i tool `sensitive_write` via `mcp_tools.enabled=false`.

---

## Scenario 5 — Infra-down (mcp-server function offline)

**Sintomi**: client esterni ricevono 5xx persistenti; dashboard non aggiorna.

**Diagnosi**
- `supabase--cloud_status` per lifecycle state.
- `supabase--edge_function_logs mcp-server` ultimi 15 min.

**Mitigazione**
- Se `ACTIVE_HEALTHY` ma function fail → re-deploy via `supabase--deploy_edge_functions`.
- Se infra `RESTARTING/UPGRADING` → status page + comunica ETA a stakeholder.
- Se prolungato (>30 min) → escalation CTO + supporto Lovable.

---

## Comunicazione

| Severity | Notify entro | Canali | Template |
|----------|-------------|--------|----------|
| **SEV1** (kill-switch attivo, data leak) | 5 min | Slack #incident + email leadership + status page | `docs/dr/post-mortem-template.md` |
| **SEV2** (degrado, no leak) | 15 min | Slack #engineering | breve nota in #status |
| **SEV3** (singolo client impattato) | 1h | Issue tracker | — |

---

## Post-Mortem

Per ogni SEV1/SEV2: post-mortem entro 5 giorni lavorativi usando il template `docs/dr/post-mortem-template.md`. Action items tracciati in `security_findings` (severity proporzionale).

---

## Quarterly drill

- Q1/Q3: scenario 3 (token leak)
- Q2/Q4: scenario 1 (latency spike) + scenario 5 (infra down)

Risultati registrati in `incident_drills` con `scenario_id='MCP_*'`.
