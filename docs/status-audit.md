# Status Audit - CRM Platform

**Data Audit**: 2026-02-03  
**Auditor**: AI Code Auditor  
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
| Vinto/Perso tabs | `Pipeline.tsx` + `ClosedDealsTable.tsx` | ✅ Implementato |

### 1.2 Contatti
| Componente | File | Stato |
|------------|------|-------|
| Tabella principale | `src/components/contacts/ContactsTableWithViews.tsx` | ✅ Completo |
| Detail Sheet | `src/components/contacts/ContactDetailSheet.tsx` | ✅ Completo |
| Click-to-Call | `src/components/contacts/ClickToCallButton.tsx` | ✅ Implementato |
| Colonna Vendite | `useContactsSales.ts` + RPC | ✅ Implementato |
| Custom Fields | `src/hooks/useCustomFields.ts` | ✅ Completo |
| Views salvabili | `src/hooks/useTableViews.ts` | ✅ Completo |

### 1.3 Vendite (Sales)
| Componente | File | Stato |
|------------|------|-------|
| Lista ordini | `src/pages/Sales.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useSalesOrders.ts` | ✅ Completo |
| Items ordine | `src/hooks/useSalesOrderItems.ts` | ✅ Completo |
| Pagamenti | `src/hooks/usePayments.ts` | ✅ Completo |
| Detail Sheet | `src/components/sales/SalesOrderDetailSheet.tsx` | ✅ Completo |
| Quick Sale Dialog | `src/components/sales/QuickSaleDialog.tsx` | ✅ Completo |
| Metodi "Rate/Noleggio" | `src/types/sales.ts` | ✅ Implementato |
| Filtri avanzati (venditore, data) | Sales page | ✅ Implementato |

### 1.4 Ticket
| Componente | File | Stato |
|------------|------|-------|
| Lista ticket | `src/pages/Tickets.tsx` | ✅ Completo |
| Detail Sheet | `src/components/tickets/TicketDetailSheet.tsx` | ✅ Completo |
| Bulk Actions | `src/hooks/useTicketBulkActions.ts` | ✅ Completo |
| SLA System | `src/hooks/useTicketQueue.ts` + cron | ✅ Completo |
| Round Robin | `ticket-assign-recovery` edge function | ✅ Completo |
| Apertura da Contatto/Deal | `CreateTicketDialog.tsx` | ✅ Implementato |
| Realtime | `src/hooks/useTicketRealtime.ts` | ✅ Completo |

### 1.5 Chat
| Componente | File | Stato |
|------------|------|-------|
| Pagina Chat | `src/pages/Chat.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useChat.ts` | ✅ Completo |
| Realtime subscription | `useChatRealtime` | ✅ Implementato |
| Entity Chat Box | `src/components/chat/EntityChatBox.tsx` | ✅ Completo |
| Chat Gruppi | `CreateGroupChatDialog.tsx` | ✅ Implementato |
| AI Chat | `supabase/functions/ai-chat/index.ts` | ✅ Funzionante (usa Lovable AI Gateway) |

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
| OAuth Google/Meta | Connettori | ⏳ Documentato (docs/oauth-channels.md) |

### 1.7 Azienda/Finanza
| Componente | File | Stato |
|------------|------|-------|
| Company Overview | `src/pages/company/CompanyOverview.tsx` | ✅ Completo |
| Expenses | `src/pages/company/CompanyExpenses.tsx` | ✅ Completo |
| Budget | `src/pages/company/CompanyBudget.tsx` | ✅ Completo |
| Reports | `src/pages/company/CompanyReports.tsx` | ✅ Completo |
| Hook Finanza | `src/hooks/useCompanyFinance.ts` | ✅ Completo |
| RBAC (CEO/Admin) | RLS + has_finance_access | ✅ Implementato |
| Calcolo Utile | Report dashboard | ⚠️ Parziale (no tasse) |

### 1.8 Eventi (Lead Events)
| Componente | File | Stato |
|------------|------|-------|
| Pagina Eventi | `src/pages/Events.tsx` | ✅ Completo |
| Hook principale | `src/hooks/useLeadEvents.ts` | ✅ Completo |
| RPC search_lead_events | DB | ✅ Implementato |
| Paginazione server-side | RPC con limit/offset | ✅ Implementato |

### 1.9 AI
| Componente | File | Stato |
|------------|------|-------|
| AI Chat Function | `supabase/functions/ai-chat/index.ts` | ✅ Funzionante |
| AI Agent Function | `supabase/functions/ai-agent/index.ts` | ✅ Funzionante |
| AI Classify | `supabase/functions/ai-classify/index.ts` | ✅ Funzionante |
| AI Tag Deals | `supabase/functions/ai-tag-deals/index.ts` | ✅ Funzionante |
| AI Config UI | `src/hooks/useAIConfig.ts` | ✅ Completo |
| Lovable Gateway | Configurato | ✅ LOVABLE_API_KEY in uso |

---

## 2. Tabella Stato Feature

| ID | Feature | Stato | Note |
|----|---------|-------|------|
| VOIP-01 | Click-to-Call `tel:` | ✅ Fatto | `ClickToCallButton.tsx`, fallback quando VOIspeed non configurato |
| VOIP-02 | VoIP Provider Integration | ✅ Fatto | VOIspeed v4 SERI API integrato |
| VOIP-03 | Call Status Webhook | ✅ Fatto | `voispeed-events-webhook` edge function |
| VOIP-04 | Screen-pop chiamate | ✅ Fatto | `IncomingCallPopup.tsx` con realtime subscription |
| VOIP-05 | VOIspeed Settings | ✅ Fatto | `VOIspeedSettings.tsx` per configurazione brand |
| SALES-01 | Lista vendite | ✅ Fatto | `Sales.tsx` + `useSalesOrders.ts` |
| SALES-02 | RBAC venditori | ✅ Fatto | RLS + filtri per venditore |
| SALES-03 | Metodi Rate/Noleggio | ✅ Fatto | Aggiunto `installment` e `rental` in types |
| SALES-04 | Bug salvataggio | ❓ Da verificare | Network analysis richiesta |
| SALES-05 | Filtri per venditore/data | ✅ Fatto | Filtri data, venditore in Sales.tsx |
| SALES-06 | Colonna vendite contatti | ✅ Fatto | RPC `get_contacts_with_sales_totals` |
| TICK-01 | Lista ticket | ✅ Fatto | Cursor pagination, SLA, queues |
| TICK-02 | Apertura ticket da contatto | ✅ Fatto | CTA in ContactDetailSheet |
| TICK-03 | Apertura ticket da deal | ✅ Fatto | CTA in DealDetailSheet |
| TICK-04 | Round Robin assegnazione | ✅ Fatto | `ticket-assign-recovery` function |
| CHAT-01 | Chat singole | ✅ Fatto | Realtime subscription working |
| CHAT-02 | Chat gruppi | ✅ Fatto | `CreateGroupChatDialog.tsx` + RPC |
| CHAT-03 | Notifiche chat | ⚠️ Parziale | Solo invalidate query, no push/badge |
| EVNT-01 | Performance eventi | ✅ Fatto | RPC paginata server-side |
| EVNT-02 | Indici DB | ✅ Fatto | Indici su brand_id, received_at |
| AI-01 | AI Chat attivo | ✅ Fatto | Usa Lovable AI Gateway (google/gemini-3-flash-preview) |
| AI-02 | AI Agent attivo | ✅ Fatto | Function calling con 10 tools |
| FIN-01 | RBAC Finance | ✅ Fatto | `has_finance_access()` SQL function |
| FIN-02 | Dashboard costi | ✅ Fatto | `CompanyOverview.tsx` |
| FIN-03 | Calcolo utile | ⚠️ Parziale | Ricavi - Costi, no tasse |
| MKTG-01 | OAuth canali | ⏳ Documentato | Architettura in docs/oauth-channels.md |
| NEURO-01 | Dashboard neuromarketing | ✅ Fatto | ActionGuide con loss aversion, urgency copy |

---

## 3. Analisi RLS e Sicurezza

### 3.1 Tabelle Critiche

| Tabella | RLS | Policy | Note |
|---------|-----|--------|------|
| `call_logs` | ✅ ON | INSERT: brand check, UPDATE: own only, SELECT: brand | ✅ Corretto |
| `voispeed_configs` | ✅ ON | Admin/CEO only per CRUD | ✅ Nuovo - Configurazione VOIspeed |
| `incoming_calls` | ✅ ON | User can see own, Admin can see all | ✅ Nuovo - Screen-pop realtime |
| `sales_orders` | ✅ ON | CRUD via brand, RLS bypass tramite untyped client | ⚠️ Verificare |
| `sales_order_items` | ✅ ON | Cascade da order | ✅ Corretto |
| `payments` | ✅ ON | Brand + order access | ✅ Corretto |
| `tickets` | ✅ ON | Complex queue-based policies | ✅ Corretto |
| `chat_messages` | ✅ ON | Thread member check | ✅ Corretto |
| `chat_threads` | ✅ ON | Member/admin check | ✅ Corretto |
| `expenses` | ✅ ON | `has_finance_access()` | ✅ Corretto |
| `budgets` | ✅ ON | `has_finance_access()` | ✅ Corretto |
| `ai_configs` | ✅ ON | Admin/CEO only | ✅ Corretto |

### 3.2 Problemi Potenziali

1. **sales_orders** usa `createClient` non tipizzato → bypass RLS se service key usata
   - ✅ Verificato: usa `VITE_SUPABASE_PUBLISHABLE_KEY`, RLS attivo

2. **call_logs** manca DELETE policy
   - ⚠️ Intenzionale per audit trail

---

## 4. Task da Completare (Priorità)

### Alta Priorità
1. **TICK-02/03**: Aggiungere CTA "Apri Ticket" in ContactDetailSheet e DealDetailSheet
2. **SALES-04**: Debug errore salvataggio vendite (riprodurre e analizzare)
3. **SALES-03**: Aggiungere metodi pagamento "rate" e "noleggio"
4. **CHAT-02**: Implementare UI creazione chat gruppi

### Media Priorità
5. **SALES-05**: Aggiungere filtri per venditore e date range in Sales page
6. **VOIP-02**: Predisporre edge function per VoIP provider (interfaccia generica)
7. **MKTG-01**: Studiare OAuth flow per Google/Meta Ads

### Bassa Priorità
8. **FIN-03**: Aggiungere stima tasse (placeholder)
9. **CHAT-03**: Implementare badge notifiche chat
10. **Neuromarketing copy**: Aggiornare microcopy in UI

---

## 5. File Chiave per Ogni Modulo

```
Pipeline:
├── src/hooks/usePipeline.ts
├── src/components/pipeline/KanbanBoard.tsx
└── src/components/pipeline/DealDetailSheet.tsx

Contatti:
├── src/hooks/useContacts.ts
├── src/hooks/useContactsSales.ts
├── src/components/contacts/ContactDetailSheet.tsx
└── src/components/contacts/ClickToCallButton.tsx

Vendite:
├── src/hooks/useSalesOrders.ts
├── src/hooks/useSalesOrderItems.ts
├── src/hooks/usePayments.ts
├── src/pages/Sales.tsx
└── src/types/sales.ts

Ticket:
├── src/hooks/useTickets.ts
├── src/hooks/useTicketsSearch.ts
├── src/hooks/useTicketBulkActions.ts
├── src/pages/Tickets.tsx
└── src/components/tickets/TicketDetailSheet.tsx

Chat:
├── src/hooks/useChat.ts
├── src/pages/Chat.tsx
└── supabase/functions/ai-chat/index.ts

Marketing:
├── src/hooks/useMarketingCampaigns.ts
├── src/hooks/useMarketingCosts.ts
├── src/hooks/useAdPlatformStats.ts
└── src/pages/marketing/MarketingDashboard.tsx

Finanza:
├── src/hooks/useCompanyFinance.ts
├── src/pages/company/CompanyOverview.tsx
├── src/pages/company/CompanyExpenses.tsx
└── src/pages/company/CompanyBudget.tsx

AI:
├── supabase/functions/ai-chat/index.ts
├── supabase/functions/ai-agent/index.ts
├── supabase/functions/ai-classify/index.ts
└── src/hooks/useAIConfig.ts
```

---

## 6. Conclusioni

### Stato Generale: **80% Completo**

**Funzionalità Core**:
- ✅ Pipeline Kanban completa
- ✅ Contatti con Click-to-Call e Vendite aggregate
- ✅ Vendite base funzionante
- ✅ Ticket con SLA, code, bulk actions
- ✅ Chat 1:1 con AI integrato
- ✅ Finanza con RBAC corretto
- ✅ AI funzionante via Lovable Gateway

**Gap Principali**:
- ❌ VoIP provider integration (solo tel:)
- ❌ Apertura ticket da contatto/deal
- ❌ Chat gruppi
- ❌ Metodi pagamento Rate/Noleggio
- ❌ OAuth per ad platforms

**Prossimi Passi Consigliati**:
1. Implementare CTA ticket in detail sheets (2h)
2. Aggiungere metodi pagamento (1h)
3. Debug vendite se necessario (1-2h)
4. UI chat gruppi (4h)
