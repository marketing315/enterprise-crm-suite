# Status Audit - CRM Platform

**Data Audit**: 2026-02-21  
**Ultimo aggiornamento**: 2026-02-21  
**Owner**: Engineering Lead  
**Cadenza aggiornamento**: Mensile (entro il 5 di ogni mese)  
**Auditor**: AI Code Auditor + Review umana  
**Commit Baseline**: Current HEAD

---

## 1. Mappa dei Moduli

### 1.1 Pipeline
| Componente | File | Stato |
|------------|------|-------|
| Hook principale | `src/hooks/usePipeline.ts` | ✅ Completo |
| Kanban Board | `src/components/pipeline/KanbanBoard.tsx` | ✅ Completo |
| Deal Detail | `src/components/pipeline/DealDetailSheet.tsx` | ✅ Completo |
| Stage Management | `src/components/settings/pipeline/PipelineStagesSettings.tsx` | ✅ Completo |
| Vinto/Perso tabs | `Pipeline.tsx` + `ClosedDealsTable.tsx` | ✅ Completo |
| AI Deal Tagging | `supabase/functions/ai-tag-deals/index.ts` | ✅ Completo |

### 1.2 Contatti
| Componente | File | Stato |
|------------|------|-------|
| Tabella principale | `src/components/contacts/ContactsTableWithViews.tsx` | ✅ Completo |
| Detail Sheet | `src/components/contacts/ContactDetailSheet.tsx` | ✅ Completo |
| Click-to-Call | `src/components/contacts/ClickToCallButton.tsx` | ✅ Completo |
| Colonna Vendite | `useContactsSales.ts` + RPC | ✅ Completo |
| Custom Fields | `src/hooks/useCustomFields.ts` | ✅ Completo |
| Views salvabili | `src/hooks/useTableViews.ts` | ✅ Completo |
| Bulk Actions | `src/components/contacts/ContactsBulkActionsBar.tsx` | ✅ Completo |

### 1.3 Vendite (Sales)
| Componente | File | Stato |
|------------|------|-------|
| Lista ordini | `src/pages/Sales.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useSalesOrders.ts` | ✅ Completo |
| Items ordine | `src/hooks/useSalesOrderItems.ts` | ✅ Completo |
| Pagamenti | `src/hooks/usePayments.ts` | ✅ Completo |
| Detail Sheet | `src/components/sales/SalesOrderDetailSheet.tsx` | ✅ Completo |
| Quick Sale Dialog | `src/components/sales/QuickSaleDialog.tsx` | ✅ Completo |
| Metodi Rate/Noleggio | `src/types/sales.ts` | ✅ Completo |
| Filtri avanzati | Sales page | ✅ Completo |

### 1.4 Ticket
| Componente | File | Stato |
|------------|------|-------|
| Lista ticket | `src/pages/Tickets.tsx` | ✅ Completo |
| Detail Sheet | `src/components/tickets/TicketDetailSheet.tsx` | ✅ Completo |
| Bulk Actions | `src/hooks/useTicketBulkActions.ts` | ✅ Completo |
| SLA System | `src/hooks/useTicketQueue.ts` + cron | ✅ Completo |
| Round Robin | `ticket-assign-recovery` edge function | ✅ Completo |
| Apertura da Contatto/Deal | `CreateTicketDialog.tsx` | ✅ Completo |
| Realtime | `src/hooks/useTicketRealtime.ts` | ✅ Completo |
| Audit Timeline | `src/components/tickets/TicketAuditTimeline.tsx` | ✅ Completo |

### 1.5 Chat
| Componente | File | Stato |
|------------|------|-------|
| Pagina Chat | `src/pages/Chat.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useChat.ts` | ✅ Completo |
| Realtime subscription | Integrato in useChat | ✅ Completo |
| Entity Chat Box | `src/components/chat/EntityChatBox.tsx` | ✅ Completo |
| Chat Gruppi | `CreateGroupChatDialog.tsx` + `GroupSettingsDrawer.tsx` | ✅ Completo |
| AI Chat | `supabase/functions/ai-chat/index.ts` | ✅ Completo |

### 1.6 Marketing/ADV
| Componente | File | Stato |
|------------|------|-------|
| Ad Platform Stats | `src/hooks/useAdPlatformStats.ts` | ✅ Completo |
| Dashboard Marketing | `src/pages/marketing/MarketingDashboard.tsx` | ✅ Completo |
| Campagne | `src/hooks/useMarketingCampaigns.ts` | ✅ Completo |
| Costi Marketing | `src/hooks/useMarketingCosts.ts` | ✅ Completo |
| Meta Apps | `src/components/settings/meta/MetaAppsSettings.tsx` | ✅ Completo |
| CAPI Events | `src/hooks/useCapiEvents.ts` | ✅ Completo |
| CAPI Sender | `supabase/functions/capi-event-sender/index.ts` | ✅ Completo |
| OAuth Google/Meta | `docs/oauth-channels.md` | ✅ Completo |
| Ad Creatives | `src/components/marketing/AdCreativesTab.tsx` | ✅ Completo |
| Ad Demographics | `src/components/marketing/AdDemographicsTab.tsx` | ✅ Completo |

### 1.7 Azienda/Finanza
| Componente | File | Stato |
|------------|------|-------|
| Company Overview | `src/pages/company/CompanyOverview.tsx` | ✅ Completo |
| Expenses | `src/pages/company/CompanyExpenses.tsx` | ✅ Completo |
| Budget | `src/pages/company/CompanyBudget.tsx` | ✅ Completo |
| Reports | `src/pages/company/CompanyReports.tsx` | ✅ Completo |
| Hook Finanza | `src/hooks/useCompanyFinance.ts` | ✅ Completo |
| RBAC (CEO/Admin) | RLS + `has_finance_access` | ✅ Completo |
| Tax Settings | `src/hooks/useBrandTaxSettings.ts` | ✅ Completo |

### 1.8 Eventi (Lead Events)
| Componente | File | Stato |
|------------|------|-------|
| Pagina Eventi | `src/pages/Events.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useLeadEvents.ts` | ✅ Completo |
| RPC search_lead_events | DB | ✅ Completo |
| Paginazione server-side | RPC con limit/offset | ✅ Completo |

### 1.9 AI
| Componente | File | Stato |
|------------|------|-------|
| AI Chat | `supabase/functions/ai-chat/index.ts` | ✅ Completo |
| AI Agent | `supabase/functions/ai-agent/index.ts` | ✅ Completo |
| AI Classify | `supabase/functions/ai-classify/index.ts` | ✅ Completo |
| AI Tag Deals | `supabase/functions/ai-tag-deals/index.ts` | ✅ Completo |
| AI Config UI | `src/hooks/useAIConfig.ts` | ✅ Completo |
| AI Metrics Dashboard | `src/pages/AdminAIMetrics.tsx` | ✅ Completo |
| Lovable Gateway | LOVABLE_API_KEY | ✅ Configurato |

### 1.10 VoIP
| Componente | File | Stato |
|------------|------|-------|
| Click-to-Call | `ClickToCallButton.tsx` | ✅ Completo |
| VOIspeed Integration | `supabase/functions/voispeed-call-request/index.ts` | ✅ Completo |
| Call Status Webhook | `supabase/functions/voispeed-events-webhook/index.ts` | ✅ Completo |
| Screen-pop chiamate | `IncomingCallPopup.tsx` | ✅ Completo |
| VOIspeed Settings | `VOIspeedSettings.tsx` | ✅ Completo |

### 1.11 Webhooks & Automazioni
| Componente | File | Stato |
|------------|------|-------|
| Inbound Webhooks (HMAC) | `supabase/functions/webhook-ingest/index.ts` | ✅ Completo |
| Outbound Webhooks | `supabase/functions/webhook-dispatcher/index.ts` | ✅ Completo |
| Automation Rules | `src/hooks/useAutomationRules.ts` | ✅ Completo |
| Automation Runner | `supabase/functions/automation-runner/index.ts` | ✅ Completo |
| DLQ Dashboard | `src/pages/AdminDlqDashboard.tsx` | ✅ Completo |
| Keplero Integration | `supabase/functions/keplero-webhook/index.ts` | ✅ Completo |

---

## 2. Tabella Stato Feature

| ID | Feature | Stato | Note |
|----|---------|-------|------|
| VOIP-01 | Click-to-Call `tel:` | ✅ Fatto | Fallback quando VOIspeed non configurato |
| VOIP-02 | VoIP Provider (VOIspeed) | ✅ Fatto | VOIspeed v4 SERI API integrato |
| VOIP-03 | Call Status Webhook | ✅ Fatto | `voispeed-events-webhook` edge function |
| VOIP-04 | Screen-pop chiamate | ✅ Fatto | `IncomingCallPopup.tsx` con realtime |
| VOIP-05 | VOIspeed Settings | ✅ Fatto | Configurazione per brand |
| SALES-01 | Lista vendite | ✅ Fatto | Con filtri avanzati |
| SALES-02 | RBAC venditori | ✅ Fatto | RLS + filtri per venditore |
| SALES-03 | Metodi Rate/Noleggio | ✅ Fatto | `installment` e `rental` in types |
| SALES-05 | Filtri per venditore/data | ✅ Fatto | Implementati in Sales.tsx |
| SALES-06 | Colonna vendite contatti | ✅ Fatto | RPC `get_contacts_with_sales_totals` |
| TICK-01 | Lista ticket | ✅ Fatto | Cursor pagination, SLA, queues |
| TICK-02 | Ticket da contatto | ✅ Fatto | CTA in ContactDetailSheet |
| TICK-03 | Ticket da deal | ✅ Fatto | CTA in DealDetailSheet |
| TICK-04 | Round Robin assegnazione | ✅ Fatto | `ticket-assign-recovery` function |
| CHAT-01 | Chat singole | ✅ Fatto | Realtime working |
| CHAT-02 | Chat gruppi | ✅ Fatto | Create + settings drawer |
| CHAT-03 | Notifiche chat | ⚠️ Parziale | Query invalidation, no push/badge nativo |
| EVNT-01 | Performance eventi | ✅ Fatto | RPC paginata server-side |
| EVNT-02 | Indici DB | ✅ Fatto | Indici su brand_id, received_at |
| AI-01 | AI Chat | ✅ Fatto | Lovable AI Gateway |
| AI-02 | AI Agent | ✅ Fatto | Function calling con tools |
| FIN-01 | RBAC Finance | ✅ Fatto | `has_finance_access()` |
| FIN-02 | Dashboard costi | ✅ Fatto | CompanyOverview |
| FIN-03 | Tax settings | ✅ Fatto | `brand_tax_settings` table + hook |
| MKTG-01 | OAuth canali | ✅ Fatto | Google + Meta OAuth flow |
| NEURO-01 | Dashboard neuromarketing | ✅ Fatto | ActionGuide con urgency copy |
| WH-01 | Inbound webhooks HMAC | ✅ Fatto | Dedup + rate limit |
| WH-02 | Outbound webhooks | ✅ Fatto | Retry + DLQ + HMAC |
| AUTO-01 | Automation engine | ✅ Fatto | Rules + runner + dispatcher |

---

## 3. Analisi RLS e Sicurezza

### 3.1 Copertura RLS
- **86/86 tabelle pubbliche** con RLS abilitato (100%)
- **0 policy permissive** (audit Q1 2026 confermato)
- Dettagli: vedi `docs/rbac-assurance.md`

### 3.2 Tabelle Critiche

| Tabella | RLS | Policy | Note |
|---------|-----|--------|------|
| `call_logs` | ✅ ON | INSERT: brand, UPDATE: own, SELECT: brand | ✅ Corretto |
| `voispeed_configs` | ✅ ON | Admin/CEO only | ✅ Corretto |
| `incoming_calls` | ✅ ON | User own + Admin all | ✅ Corretto |
| `sales_orders` | ✅ ON | CRUD via brand | ✅ Corretto |
| `tickets` | ✅ ON | Queue-based policies | ✅ Corretto |
| `chat_messages` | ✅ ON | Thread member check | ✅ Corretto |
| `expenses` | ✅ ON | `has_finance_access()` | ✅ Corretto |
| `budgets` | ✅ ON | `has_finance_access()` | ✅ Corretto |
| `ai_configs` | ✅ ON | Admin/CEO only | ✅ Corretto |
| `webhook_endpoints` | ✅ ON | Admin only | ✅ Corretto |
| `automation_rules` | ✅ ON | Admin only | ✅ Corretto |

### 3.3 Note Sicurezza
- `call_logs`: nessuna DELETE policy (intenzionale per audit trail)
- Edge functions: HMAC validation su inbound, JWT + brand check su outbound
- Cron auth: service_role + x-cron-secret con rotazione zero-downtime

---

## 4. Bug Hardening Pass (2026-02-21)

| ID | Descrizione | Severità | Stato |
|----|-------------|----------|-------|
| B1 | `requireBrand` non enforced in ProtectedRoute | P0 | ✅ Fixato |
| B2 | Bootstrap auth senza catch/finally | P0 | ✅ Fixato |
| B3 | parse-sale-document ritorna success su parse fail | P1 | ✅ Fixato |
| S1 | Query persister catch silenzioso | P1 | ✅ Fixato |
| S2 | SLA parse fallback silenzioso | P1 | ✅ Fixato |
| S3 | Ticket queue prefs non validate | P2 | ✅ Fixato |
| S4 | 404 loggato come error | P2 | ✅ Fixato |

---

## 5. Gap Residui

| ID | Descrizione | Priorità | Note |
|----|-------------|----------|------|
| CHAT-03 | Push notifications / badge nativo | P3 | Solo query invalidation attuale |
| TODO-ADS | `google-ads-sync` mapping campaign_id | P3 | TODO nel codice |
| TODO-AI | `ai-classify` appointment create/update | P3 | TODO nel codice |

---

## 6. CI/QA

| Gate | Stato | Note |
|------|-------|------|
| `tsc --noEmit` | ✅ Verde | In CI e locale |
| `vitest run` | ✅ Verde | 27 test, 0 fail |
| E2E smoke | ✅ Verde | `e2e-gate.yml` |
| E2E feature | ✅ Verde | tickets, webhooks, inbound |
| Secrets scan | ✅ Verde | `secrets-scan.yml` |
| Lint | ✅ Verde | In CI via `e2e-gate.yml` |

---

## 7. Conclusioni

### Stato Generale: **95% Completo**

**Funzionalità Core**: Tutte operative e verificate.  
**Sicurezza**: RLS 100%, audit Q1 2026 superato.  
**QA**: Pipeline CI con 7 gate bloccanti, zero-exception policy attiva.  
**Gap residui**: Solo 3 item P3 (push notifications, 2 TODO in edge functions).
