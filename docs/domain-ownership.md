# Frontend Domain Ownership

> Mappa di responsabilità per dominio. Ogni PR che tocca file di un dominio deve essere rivista dal domain owner.

---

## Domini e Confini

| Dominio | Owner | Routes | Componenti | Hooks | Edge Functions |
|---------|-------|--------|-----------|-------|----------------|
| **Auth & Routing** | Core | `/login`, `/reset-password`, `/select-brand`, `/dashboard*` | `auth/*`, `layout/*`, `dashboard/*` | `useAuth`, `useRoleDashboard`, `usePrefetchOnLogin` | `admin-create-user`, `admin-manage-*` |
| **Pipeline & Deals** | Sales | `/pipeline` | `pipeline/*` | `usePipeline`, `useDealScoring`, `useCanEditDeals`, `useContactDeal` | `ai-tag-deals` |
| **Contacts** | Sales | `/contacts` | `contacts/*`, `contacts/views/*` | `useContacts*`, `useContactSearch`, `usePaginatedContactSearch`, `useCustomFields` | — |
| **Sales & Products** | Sales | `/sales`, `/products` | `sales/*` | `useSalesOrders`, `useSalesOrderItems`, `usePayments`, `useProducts`, `useContactsSales` | `parse-sale-document` |
| **Tickets** | Support | `/tickets` | `tickets/*` | `useTickets*`, `useTicketQueue`, `useTicketBulkActions`, `useTicketAuditLogs` | `sla-breach-checker`, `ticket-assign-recovery` |
| **Marketing** | Marketing | `/marketing*` | `marketing/*` | `useMarketing*`, `useAdPlatformStats`, `useAdCreativeStats`, `useAdDemographics` | `ads-stats-meta`, `google-ads-sync` |
| **Appointments** | Operations | `/appointments` | `appointments/*` | `useAppointments`, `useClinicalTopics` | — |
| **Company & Finance** | Finance | `/azienda*`, `/ceo-dashboard` | `ceo/*`, `forecast/*` | `useCeoDashboard`, `useCeoOperationalKpis`, `useCompanyFinance`, `useCostCenters`, `useForecast` | `generate-weekly-report` |
| **Team & RBAC** | Core | `/team*` | `team/*`, `settings/admin/*` | `useTeam`, `useUserPermissions`, `useSalespersonKpis` | `admin-manage-team` |
| **Chat & AI** | AI | `/chat` | `chat/*` | `useChat`, `useAIAgent`, `useAIConfig`, `useAIMetrics` | `ai-agent`, `ai-chat`, `ai-classify` |
| **Webhooks & Automation** | Platform | `/settings` (webhook tabs), `/admin/webhooks`, `/admin/dlq` | `settings/webhooks/*`, `settings/automation/*`, `settings/inbound/*` | `useWebhooks`, `useWebhookMetrics`, `useAutomation*`, `useInboundSources`, `useDlqData` | `webhook-ingest`, `webhook-dispatcher`, `automation-*` |
| **Meta & CAPI** | Marketing | `/admin/capi`, settings meta tab | `settings/meta/*` | `useMetaApps`, `useCapiEvents`, `useCapiMonitor` | `meta-leads-webhook`, `meta-subscribe-page`, `capi-event-sender` |
| **Google Sheets** | Platform | settings sheets tab | `settings/GoogleSheetsSettings` | — | `sheets-export`, `sheets-*` |
| **Tags** | Core | (cross-cutting) | `tags/*` | `useTags` | — |
| **Notifications** | Core | `/notifications` | `notifications/*` | `useNotifications` | — |
| **Analytics** | Analytics | `/admin/analytics`, `/admin/callcenter-kpi`, `/admin/ticket-trend`, `/admin/ai-metrics` | `admin/*` | `useAdvancedAnalytics`, `useFunnelMetrics`, `useCallcenterKpis`, `useTicketTrend` | — |
| **UI Design System** | Core | — | `ui/*` | `use-mobile`, `use-toast` | — |

---

## File Boundary Rules

```
src/
├── components/
│   ├── auth/          → Core
│   ├── layout/        → Core
│   ├── ui/            → Core (design system)
│   ├── dashboard/     → Core
│   ├── pipeline/      → Sales
│   ├── contacts/      → Sales
│   ├── sales/         → Sales
│   ├── tickets/       → Support
│   ├── marketing/     → Marketing
│   ├── appointments/  → Operations
│   ├── ceo/           → Finance
│   ├── forecast/      → Finance
│   ├── chat/          → AI
│   ├── admin/         → Analytics
│   ├── team/          → Core
│   ├── tags/          → Core
│   ├── notifications/ → Core
│   └── settings/
│       ├── webhooks/     → Platform
│       ├── automation/   → Platform
│       ├── inbound/      → Platform
│       ├── meta/         → Marketing
│       ├── pipeline/     → Sales
│       └── admin/        → Core
├── hooks/             → owned by matching domain
├── pages/             → owned by matching domain
└── lib/               → Core (shared utilities)
```

---

## Cross-Cutting Concerns

Alcuni moduli attraversano più domini. Le modifiche a questi richiedono review da **Core**:

| Modulo | Motivo |
|--------|--------|
| `BrandContext` | Tutti i domini filtrano per brand |
| `AuthContext` | Tutti i domini dipendono da auth state |
| `ProtectedRoute` | Gate RBAC per tutte le route |
| `MainLayout` | Sidebar/header condiviso |
| `index.css` / `tailwind.config.ts` | Design tokens globali |
| `App.tsx` | Route map completa |
| `supabase/client.ts` | Client condiviso (auto-generated) |

---

## Quality KPIs per Dominio

| KPI | Definizione | Target |
|-----|------------|--------|
| **PR Lead Time** | Tempo da apertura PR a merge | < 24h per fix, < 48h per feature |
| **Defect Escape Rate** | Bug in produzione / totale PR mergate nel dominio | < 5% |
| **Test Coverage** | Smoke + unit test copertura moduli dominio | 100% pagine core in smoke |
| **Review Turnaround** | Tempo prima review da domain owner | < 4h business hours |

### Come misurare

- **PR Lead Time**: GitHub Insights → tempo medio merge per label dominio
- **Defect Escape Rate**: tag issue con `domain:sales`, `domain:support`, etc. → rapporto issue/PR per periodo
- **Test Coverage**: `npx vitest run --coverage` filtrato per path dominio

---

## PR Labeling Convention

Ogni PR deve avere almeno un label dominio:

```
domain:core, domain:sales, domain:support, domain:marketing,
domain:finance, domain:ai, domain:platform, domain:analytics, domain:operations
```

PR che toccano più domini: applicare tutti i label pertinenti → review richiesta da ogni owner coinvolto.

---

## PR Review Checklist (Obbligatoria)

> Ogni reviewer deve verificare questi punti prima di approvare. Blocca merge se non rispettati.

### Boundary Check

- [ ] **Nessun import cross-domain non autorizzato** — un componente `pipeline/*` NON importa da `tickets/*`, `marketing/*`, etc.
  - ✅ Consentito: importare da `ui/*`, `lib/*`, `contexts/*`, `hooks/use-mobile`, `hooks/use-toast`
  - ❌ Vietato: importare componenti/hook di un altro dominio direttamente
  - 🔄 Se serve: estrarre in `lib/` o `ui/` e fare review Core
- [ ] **Hook ownership rispettata** — hook usato solo dal dominio proprietario o tramite API pubblica esplicita
- [ ] **Nessuna rotta aggiunta senza aggiornamento `domain-ownership.md`** — nuove route → aggiornare la tabella domini
- [ ] **Edge Function nuove/modificate dichiarate** — aggiornare colonna Edge Functions nella tabella

### Cross-Cutting Safety

- [ ] **Modifiche a file cross-cutting → review Core obbligatoria** (vedi tabella §Cross-Cutting Concerns)
- [ ] **Design tokens usati** — nessun colore hardcoded (`text-white`, `bg-blue-500`), solo semantic tokens (`text-foreground`, `bg-primary`)
- [ ] **RLS verificata** — se la PR tocca query DB, verificare che RLS sia applicata e coerente con la matrice accesso RBAC

### Quality Gate

- [ ] **CI verde** — tutti i gate (tsc, build, unit, smoke, E2E, secret-scan) passano
- [ ] **Nessun `// @ts-ignore` o `as any` aggiunto** senza commento giustificativo
- [ ] **Nessuna dipendenza aggiunta** senza giustificazione nel PR body
- [ ] **Changeset documentato** — se modifica user-facing, entry in `docs/changelog.md`

### Dominio-Specifico

| Dominio | Check aggiuntivo |
|---------|-----------------|
| Core | Nessun breaking change a AuthContext/BrandContext senza migrazione |
| Sales | Deal mutation verifica `assigned_user_id` ownership |
| Support | Ticket query usa cursor-based pagination, no offset |
| Platform | Webhook endpoint valida HMAC signature |
| AI | Override rate monitorata, nuovo prompt versionato in `ai_prompts` |
| Marketing | Nessuna API key Meta/Google in codice, solo Cloud secrets |
