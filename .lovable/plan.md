

# Aggiornamento Realtime su tutto il sito

## Obiettivo
Ogni modifica (inserimento, aggiornamento, eliminazione) su qualsiasi dato del CRM sara' visibile istantaneamente a tutti gli utenti connessi, senza ricaricare la pagina.

## Stato attuale
Tabelle GIA' abilitate al realtime:
- contacts, contact_phones
- tickets, ticket_comments, ticket_audit_logs
- chat_messages, chat_message_reads
- notifications
- incoming_calls, call_logs
- automation_jobs, webhook_inbound_events

## Tabelle da aggiungere al realtime

| Tabella | Pagina/Sezione |
|---------|---------------|
| deals | Pipeline / Kanban |
| deal_stage_history | Pipeline timeline |
| lead_events | Eventi Lead |
| appointments | Appuntamenti |
| sales_orders | Vendite |
| sales_order_items | Dettaglio vendite |
| payments | Pagamenti |
| products | Prodotti |
| marketing_campaigns | Marketing Campagne |
| marketing_costs | Marketing Costi |
| tags | Tag ovunque |
| tag_assignments | Tag su contatti/deal |
| pipeline_stages | Configurazione pipeline |
| admin_todos | Dashboard TODO |
| action_suggestions | Dashboard suggerimenti |

## Implementazione

### 1. Migrazione database
Una singola migrazione SQL per abilitare il realtime su tutte le tabelle mancanti:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_stage_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_costs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tag_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_todos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_suggestions;
```

### 2. Hook centralizzato: `useGlobalRealtime.ts`
Un unico hook che sottoscrive TUTTE le tabelle rimanenti e invalida le cache React-Query corrispondenti. Struttura:

- Un canale per gruppo logico (pipeline, sales, marketing, ecc.)
- Filtraggio per `brand_id` quando non in modalita' "Azienda Intera"
- Invalidazione mirata delle queryKey corrette per ogni tabella

Mappatura tabella -> queryKey da invalidare:
- `deals` -> `["deals"]`, `["deal-scoring"]`, `["pipeline-stages"]`
- `deal_stage_history` -> `["deals"]`
- `lead_events` -> `["lead-events"]`, `["contact-lead-events"]`
- `appointments` -> `["appointments"]`
- `sales_orders` -> `["sales-orders"]`, `["sales-kpis"]`
- `sales_order_items` -> `["sales-orders"]`, `["sales-order-items"]`
- `payments` -> `["payments"]`
- `products` -> `["products"]`
- `marketing_campaigns` -> `["marketing-campaigns"]`
- `marketing_costs` -> `["marketing-costs"]`, `["marketing-kpis"]`
- `tags` / `tag_assignments` -> `["tags"]`, `["deals"]`, `["contacts"]`, `["contact-search"]`
- `pipeline_stages` -> `["pipeline-stages"]`
- `admin_todos` -> `["admin-todos"]`
- `action_suggestions` -> `["action-suggestions"]`

### 3. Integrazione nel layout
L'hook `useGlobalRealtime()` viene chiamato una sola volta dentro `MainLayout.tsx`, cosi' e' attivo su TUTTE le pagine senza doverlo aggiungere pagina per pagina. Questo si affianca agli hook gia' esistenti (`useTicketRealtime`, `useContactsRealtime`) che restano separati perche' gestiscono anche notifiche/toast specifici.

### Dettagli tecnici

- I canali Supabase saranno raggruppati per dominio (es. `global-pipeline-rt`, `global-sales-rt`, `global-marketing-rt`) per mantenere il codice organizzato
- La sottoscrizione viene ricostruita quando cambia il brand selezionato
- In modalita' "Azienda Intera" non si applica filtro `brand_id` (si ascolta tutto)
- L'invalidazione usa `queryClient.invalidateQueries` con match parziale cosi' copre tutte le varianti di parametri nelle query key
- Nessun impatto sulle performance: Supabase Realtime usa WebSocket, i messaggi arrivano solo quando ci sono cambiamenti effettivi

