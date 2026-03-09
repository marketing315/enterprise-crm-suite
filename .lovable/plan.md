

# Piano: Accesso completo ai dati per il chatbot Executive

## Problema
L'agente AI ha accesso solo a 6 dataset (leads, contacts, deals, tickets, appointments, calls) tramite `dynamic_analytics_query` e pochi tool dedicati. Tabelle importanti come spese, budget, ordini di vendita, prodotti, campagne marketing, eventi e storico pipeline sono inaccessibili.

## Soluzione

### 1. Estendere la RPC `dynamic_analytics_query` con nuovi dataset

Aggiungere alla funzione SQL i seguenti dataset:

| Dataset | Tabella | Colonna data | Metriche extra |
|---------|---------|-------------|----------------|
| `expenses` | `expenses` | `expense_date` | `sum_amount` |
| `budgets` | `budgets` | `created_at` | `sum_amount`, `sum_spent` |
| `sales_orders` | `sales_orders` | `created_at` | `sum_total`, `count` |
| `products` | `products` | `created_at` | `count`, `sum_price` |
| `marketing_campaigns` | `marketing_campaigns` | `created_at` | `count` |
| `events` | `events` | `event_date` | `count` |
| `deal_transitions` | `deal_stage_transitions` | `occurred_at` | `count` |

Aggiungere metriche: `sum_amount`, `sum_total`, `sum_price`, `sum_spent`.

Aggiungere filtri: `category_id`, `cost_center_id`, `payment_status`, `campaign_id`.

Aggiungere group_by: `payment_status`, `category`, `campaign_name`, `product_name`, `from_stage_label`, `to_stage_label`.

### 2. Aggiungere un tool `get_raw_table_data` generico

Un nuovo tool che consente all'agente di leggere direttamente righe da qualsiasi tabella del brand con filtri base. Implementato con whitelist di tabelle consentite e colonne selezionabili, limitato a 50 righe. Questo copre casi non analitici (es. "mostrami le ultime 10 spese", "quali prodotti abbiamo?").

Tabelle whitelistate: `expenses`, `budgets`, `sales_orders`, `products`, `marketing_campaigns`, `events`, `automation_rules`, `automation_logs`, `deal_stage_transitions`, `pipeline_stages`, `expense_categories`, `cost_centers`.

### 3. Aggiornare il System Prompt

Aggiungere al catalogo metriche i nuovi dataset e le nuove metriche. Aggiungere istruzioni su quando usare `get_raw_table_data` vs `dynamic_analytics_query`.

### 4. Aggiornare il tool enum nell'Edge Function

Estendere l'enum `dataset` del tool `dynamic_analytics_query` e aggiungere la definizione del nuovo tool `get_raw_table_data`.

### File modificati
- **Migration SQL**: nuova migration per estendere `dynamic_analytics_query`
- **`supabase/functions/ai-agent/index.ts`**: nuovi dataset nell'enum, nuovo tool `get_raw_table_data`, handler, system prompt aggiornato

