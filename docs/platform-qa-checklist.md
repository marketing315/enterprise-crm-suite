# Platform QA Checklist - Test End-to-End Completo

Questo documento fornisce tutte le istruzioni operative per testare la piattaforma CRM end-to-end, coprendo frontend, Database/RLS, Edge Functions, e tutti i ruoli RBAC.

---

## 0. Obiettivo e Regole

### Obiettivo
Validare che l'app funzioni correttamente per:
- Tutti i moduli (Pipeline, Marketing, Team, KPI, Azienda, Tickets, Chat/AI)
- Tutti i ruoli RBAC e le regole brand (singolo / "tutti i brand")
- Azioni critiche (CRUD, drag&drop, assegnazioni, KPI, export, RLS)

### Regole Operative
1. Testare sempre su ambiente di staging con dataset controllato
2. Ogni bug deve avere: passi per riprodurre, ruolo, brand, expected vs actual, screenshot, log network/console
3. Dopo ogni fix: regression sui 10 smoke test critici
4. Non modificare dati di produzione

---

## 1. Setup Ambiente

### 1.1 Brand di Test (UUID Reali)

| Brand | UUID | Scopo | Note |
|-------|------|-------|------|
| **Azienda Intera** | `00000000-0000-0000-0000-000000000000` | Aggregazioni globali | `is_system=true` |
| **Excell** | `2dc052de-26b5-48ef-8dee-917ea591a681` | Test vendite + marketing | Brand principale vendite |
| **MyMed** | `4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5` | Test call center + tickets | Brand principale callcenter |
| **Sonimed** | `ab447ddd-3183-4bd2-982c-641746f0a7f7` | Test secondario | Opzionale |

> ⚠️ **NOTA "Tutti i brand" / "Azienda Intera"**:
> - Il brand con UUID `00000000-...` e `is_system=true` rappresenta l'aggregazione globale
> - Le RPC (es. `get_admin_finance_kpis`, `get_marketing_campaign_kpis`) devono gestire questo caso lato DB
> - Il QA deve verificare che le aggregazioni siano corrette e **non duplicate** (ogni record contato una sola volta)
> - Se il progetto usa costanti come `COMPANY_BRAND_ID`, verificare che siano allineate

### 1.2 Ruoli Enum (Verificati nel DB)

**Ruoli Canonici (usare per tutti i test RBAC):**
```text
admin, ceo, amministrazione, responsabile_venditori, 
responsabile_callcenter, venditore, operatore_callcenter
```

**Ruoli Legacy (non usare nei test, solo retro-compatibilità):**
```text
callcenter, sales
```

> ⚠️ **NOTA**: I ruoli `callcenter` e `sales` sono legacy e non devono essere usati nei test RBAC principali. Usarli solo per eventuali test di retro-compatibilità (opzionale).

### 1.3 Prerequisiti Tecnici

- [ ] Accesso al frontend (preview o staging)
- [ ] Accesso a Supabase Dashboard o SQL Editor
- [ ] Edge Functions deployate (`admin-manage-team`, `admin-manage-users`)
- [ ] Browser DevTools attivo per Network/Console

---

## 2. Utenti di Test (10 Utenti)

### 2.1 Tabella Utenti

| # | Email | Ruolo | Brand | Password | Note |
|---|-------|-------|-------|----------|------|
| 1 | `admin.qa@example.com` | admin | Globale | Test!12345 | Accesso completo |
| 2 | `ceo.qa@example.com` | ceo | Globale | Test!12345 | Come admin, no gestione admin |
| 3 | `amm.excell@example.com` | amministrazione | Excell | Test!12345 | Finanze + costi marketing |
| 4 | `amm.mymed@example.com` | amministrazione | MyMed | Test!12345 | Finanze + costi marketing |
| 5 | `resp.vendite@example.com` | responsabile_venditori | Excell | Test!12345 | Gestisce venditori |
| 6 | `resp.callcenter@example.com` | responsabile_callcenter | MyMed | Test!12345 | Gestisce operatori |
| 7 | `venditore1@example.com` | venditore | Excell | Test!12345 | Vede propri deal |
| 8 | `venditore2@example.com` | venditore | Excell | Test!12345 | Vede propri deal |
| 9 | `operatore1@example.com` | operatore_callcenter | MyMed | Test!12345 | Gestisce ticket |
| 10 | `operatore2@example.com` | operatore_callcenter | MyMed | Test!12345 | Gestisce ticket |

> ⚠️ **SICUREZZA**: Non usare password di produzione. Non riutilizzare credenziali reali. Il dominio `@example.com` è riservato per test (RFC 2606).

### 2.2 Creazione Utenti

#### Metodo A (Consigliato): Edge Function `admin-manage-team`

```bash
# Esempio per ogni utente - eseguire da admin loggato
curl -X POST "https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/admin-manage-team" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "invite",
    "brand_id": "2dc052de-26b5-48ef-8dee-917ea591a681",
    "email": "venditore1@test.local",
    "role": "venditore",
    "full_name": "Venditore Test 1"
  }'
```

#### Metodo B (Fallback): SQL Diretto

```sql
-- NOTA: Prima creare utenti in Supabase Auth Dashboard, poi:

-- 1. Inserire in public.users (se non esiste già via trigger)
INSERT INTO public.users (id, full_name, email, is_active)
VALUES 
  ('UUID_DA_AUTH', 'Admin QA', 'admin.qa@test.local', true),
  ('UUID_DA_AUTH', 'CEO QA', 'ceo.qa@test.local', true),
  ('UUID_DA_AUTH', 'Amm Excell', 'amm.excell@test.local', true),
  ('UUID_DA_AUTH', 'Amm MyMed', 'amm.mymed@test.local', true),
  ('UUID_DA_AUTH', 'Resp Vendite', 'resp.vendite@test.local', true),
  ('UUID_DA_AUTH', 'Resp Callcenter', 'resp.callcenter@test.local', true),
  ('UUID_DA_AUTH', 'Venditore 1', 'venditore1@test.local', true),
  ('UUID_DA_AUTH', 'Venditore 2', 'venditore2@test.local', true),
  ('UUID_DA_AUTH', 'Operatore 1', 'operatore1@test.local', true),
  ('UUID_DA_AUTH', 'Operatore 2', 'operatore2@test.local', true);

-- 2. Assegnare ruoli in user_roles
-- Admin (globale - assegnare a brand system)
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_ADMIN', '00000000-0000-0000-0000-000000000000', 'admin');

-- CEO (globale)
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_CEO', '00000000-0000-0000-0000-000000000000', 'ceo');

-- Amministrazione Excell
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_AMM_EXCELL', '2dc052de-26b5-48ef-8dee-917ea591a681', 'amministrazione');

-- Amministrazione MyMed
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_AMM_MYMED', '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'amministrazione');

-- Responsabile Venditori Excell
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_RESP_VEND', '2dc052de-26b5-48ef-8dee-917ea591a681', 'responsabile_venditori');

-- Responsabile Callcenter MyMed
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES ('UUID_RESP_CC', '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'responsabile_callcenter');

-- Venditori Excell
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES 
  ('UUID_VEND1', '2dc052de-26b5-48ef-8dee-917ea591a681', 'venditore'),
  ('UUID_VEND2', '2dc052de-26b5-48ef-8dee-917ea591a681', 'venditore');

-- Operatori Callcenter MyMed
INSERT INTO public.user_roles (user_id, brand_id, role)
VALUES 
  ('UUID_OP1', '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'operatore_callcenter'),
  ('UUID_OP2', '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'operatore_callcenter');
```

### 2.3 Validazioni Post-Creazione

Per ogni utente verificare:
- [ ] Login riuscito
- [ ] Brand selector mostra solo brand autorizzati
- [ ] Menu laterale mostra solo voci permesse
- [ ] Nessun errore console al caricamento

---

## 3. Dataset Minimo (Seed SQL)

### 3.1 Pipeline - Brand Excell

> ⚠️ **SCHEMA REALE VERIFICATO**:
> - `deal_status` enum: `open` | `won` | `lost` | `closed` | `reopened_for_support`
> - I deal `won`/`lost` devono avere `closed_at` valorizzato per KPI corretti
> - Esiste un trigger `set_deal_closed_at` che lo valorizza automaticamente (verificare sia attivo)

```sql
-- ============================================
-- SEED PIPELINE EXCELL (Deterministico)
-- ============================================

-- BRAND_EXCELL = '2dc052de-26b5-48ef-8dee-917ea591a681'

-- 1. Recuperare UUID venditori (eseguire prima e salvare i valori)
SELECT u.id, u.email, ur.role 
FROM public.users u
JOIN user_roles ur ON u.id = ur.user_id
WHERE ur.brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
AND ur.role = 'venditore';
-- Salvare: UUID_VEND1 (venditore1@example.com), UUID_VEND2 (venditore2@example.com)

-- 2. Verificare pipeline_stages esistenti
SELECT id, name, position FROM pipeline_stages 
WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
ORDER BY position;
-- Salvare: stage_id per ogni colonna (Nuovo Lead, In Lavorazione, ecc.)

-- 3. Creare 12 contatti per Excell
INSERT INTO contacts (brand_id, first_name, last_name, email, city, status)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Mario', 'Rossi', 'mario.rossi@example.com', 'Milano', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Luigi', 'Verdi', 'luigi.verdi@example.com', 'Roma', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Anna', 'Bianchi', 'anna.bianchi@example.com', 'Napoli', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Paolo', 'Neri', 'paolo.neri@example.com', 'Torino', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Giulia', 'Ferrari', 'giulia.ferrari@example.com', 'Bologna', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Marco', 'Russo', 'marco.russo@example.com', 'Firenze', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Sara', 'Colombo', 'sara.colombo@example.com', 'Venezia', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Andrea', 'Ricci', 'andrea.ricci@example.com', 'Genova', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Elena', 'Galli', 'elena.galli@example.com', 'Palermo', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Francesco', 'Costa', 'francesco.costa@example.com', 'Bari', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Chiara', 'Fontana', 'chiara.fontana@example.com', 'Catania', 'active'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Roberto', 'Moretti', 'roberto.moretti@example.com', 'Verona', 'active')
RETURNING id, first_name, last_name, email;
-- Salvare gli ID per lookup successivo

-- 4. Pattern deterministico con CTE per creare deal
-- Questo evita placeholder manuali
WITH 
  contacts_excell AS (
    SELECT id, email, ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM contacts 
    WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
    AND email LIKE '%@example.com'
  ),
  stages AS (
    SELECT id, name, position
    FROM pipeline_stages
    WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
  ),
  venditori AS (
    SELECT u.id, u.email, ROW_NUMBER() OVER (ORDER BY u.email) as vn
    FROM public.users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
    AND ur.role = 'venditore'
  )
-- Deal Open (8) - 4 per ogni venditore
INSERT INTO deals (brand_id, contact_id, current_stage_id, status, value, assigned_user_id, notes)
SELECT 
  '2dc052de-26b5-48ef-8dee-917ea591a681',
  c.id,
  (SELECT id FROM stages WHERE position = (c.rn % 4) + 1 LIMIT 1),
  'open',
  5000 + (c.rn * 500),
  (SELECT id FROM venditori WHERE vn = CASE WHEN c.rn <= 4 THEN 1 ELSE 2 END),
  'Deal test ' || c.rn
FROM contacts_excell c
WHERE c.rn <= 8;

-- Deal Won (2) - con closed_at
INSERT INTO deals (brand_id, contact_id, current_stage_id, status, value, assigned_user_id, closed_at, notes)
SELECT 
  '2dc052de-26b5-48ef-8dee-917ea591a681',
  c.id,
  (SELECT id FROM stages ORDER BY position DESC LIMIT 1), -- ultimo stage
  'won',
  CASE WHEN c.rn = 9 THEN 25000 ELSE 18000 END,
  (SELECT id FROM venditori WHERE vn = c.rn - 8),
  NOW() - INTERVAL '5 days' * (c.rn - 8),
  'Deal vinto test'
FROM contacts_excell c
WHERE c.rn IN (9, 10);

-- Deal Lost (2) - con closed_at
INSERT INTO deals (brand_id, contact_id, current_stage_id, status, value, assigned_user_id, closed_at, notes)
SELECT 
  '2dc052de-26b5-48ef-8dee-917ea591a681',
  c.id,
  (SELECT id FROM stages ORDER BY position DESC LIMIT 1),
  'lost',
  CASE WHEN c.rn = 11 THEN 10000 ELSE 8000 END,
  (SELECT id FROM venditori WHERE vn = c.rn - 10),
  NOW() - INTERVAL '7 days' * (c.rn - 10),
  'Deal perso test'
FROM contacts_excell c
WHERE c.rn IN (11, 12);

-- Verifica risultato
SELECT 
  d.id, d.status, d.value, d.closed_at,
  c.first_name || ' ' || c.last_name as contact_name,
  u.email as assigned_to
FROM deals d
JOIN contacts c ON d.contact_id = c.id
LEFT JOIN public.users u ON d.assigned_user_id = u.id
WHERE d.brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681'
ORDER BY d.created_at;
```

### 3.2 Pipeline - Brand MyMed

```sql
-- ============================================
-- SEED PIPELINE MYMED (Call Center)
-- ============================================

-- 8 contatti per MyMed
INSERT INTO contacts (brand_id, first_name, last_name, email, city, status)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Luca', 'Martini', 'luca.martini@test.com', 'Milano', 'new'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Federica', 'Greco', 'federica.greco@test.com', 'Roma', 'new'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Simone', 'Lombardi', 'simone.lombardi@test.com', 'Napoli', 'active'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Valentina', 'Barbieri', 'valentina.barbieri@test.com', 'Torino', 'active'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Davide', 'Santoro', 'davide.santoro@test.com', 'Bologna', 'active'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Alessia', 'Marini', 'alessia.marini@test.com', 'Firenze', 'active'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Matteo', 'Conti', 'matteo.conti@test.com', 'Venezia', 'active'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Giorgia', 'Leone', 'giorgia.leone@test.com', 'Genova', 'active')
RETURNING id, first_name, last_name;

-- 8 deal per call center (tutti open, in lavorazione iniziale)
INSERT INTO deals (brand_id, contact_id, current_stage_id, status, value, notes)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM1', 'STAGE_ID_NUOVO_MM', 'open', 3000, 'Lead da call center'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM2', 'STAGE_ID_NUOVO_MM', 'open', 4500, 'Lead da call center'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM3', 'STAGE_ID_QUALIFICATO_MM', 'open', 6000, 'Qualificato'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM4', 'STAGE_ID_QUALIFICATO_MM', 'open', 5500, 'Qualificato'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM5', 'STAGE_ID_APPUNTAMENTO_MM', 'open', 8000, 'Appuntamento fissato'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM6', 'STAGE_ID_APPUNTAMENTO_MM', 'open', 7000, 'Appuntamento fissato'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM7', 'STAGE_ID_NUOVO_MM', 'open', 2500, 'Nuovo lead'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_ID_MM8', 'STAGE_ID_NUOVO_MM', 'open', 3500, 'Nuovo lead');
```

### 3.3 Marketing

> ⚠️ **SCHEMA REALE VERIFICATO**:
> - `marketing_channels.type`: TEXT (convenzione: `paid` | `organic` | `offline`)
> - `marketing_campaigns`: richiede `start_date` (NOT NULL) e `created_by` (NOT NULL)
> - `marketing_costs`: usa `notes` e `source` (non `description`), richiede `created_by`
> - `marketing_campaign_status` enum: `planned` | `active` | `paused` | `closed`

```sql
-- ============================================
-- SEED MARKETING (Schema-compliant)
-- ============================================

-- Prima: recuperare UUID admin per created_by
-- SELECT id FROM public.users WHERE email = 'admin.qa@example.com';
-- Placeholder: UUID_ADMIN

-- 1. Canali per Excell (type: paid/organic/offline)
INSERT INTO marketing_channels (brand_id, name, type, is_active)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Meta Ads', 'paid', true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Google Ads', 'paid', true)
RETURNING id, name;
-- Salvare: CHANNEL_META_EXCELL, CHANNEL_GOOGLE_EXCELL

-- 2. Canali per MyMed
INSERT INTO marketing_channels (brand_id, name, type, is_active)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Meta Ads MyMed', 'paid', true),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'Google Ads MyMed', 'paid', true)
RETURNING id, name;
-- Salvare: CHANNEL_META_MYMED, CHANNEL_GOOGLE_MYMED

-- 3. Campagne Excell (con start_date e created_by OBBLIGATORI)
INSERT INTO marketing_campaigns (brand_id, channel_id, name, status, external_id, start_date, created_by)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CHANNEL_META_EXCELL', 'Black Friday Meta', 'active', 'meta_bf_2024', CURRENT_DATE - 20, 'UUID_ADMIN'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CHANNEL_GOOGLE_EXCELL', 'Lead Gen Google', 'active', 'google_lg_2024', CURRENT_DATE - 15, 'UUID_ADMIN')
RETURNING id, name;
-- Salvare: CAMPAIGN_META_EXCELL, CAMPAIGN_GOOGLE_EXCELL

-- 4. Campagne MyMed
INSERT INTO marketing_campaigns (brand_id, channel_id, name, status, external_id, start_date, created_by)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CHANNEL_META_MYMED', 'Campagna Salute', 'active', 'meta_salute_2024', CURRENT_DATE - 18, 'UUID_ADMIN'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CHANNEL_GOOGLE_MYMED', 'Search Medico', 'active', 'google_med_2024', CURRENT_DATE - 12, 'UUID_ADMIN')
RETURNING id, name;
-- Salvare: CAMPAIGN_META_MYMED, CAMPAIGN_GOOGLE_MYMED

-- 5. Costi Marketing (usa notes/source, NON description)
-- created_by = UUID dell'utente amministrazione
INSERT INTO marketing_costs (brand_id, campaign_id, cost_date, amount, source, notes, created_by)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAMPAIGN_META_EXCELL', CURRENT_DATE - 14, 1500, 'manual', 'Settimana 1 Meta', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAMPAIGN_META_EXCELL', CURRENT_DATE - 7, 1800, 'manual', 'Settimana 2 Meta', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAMPAIGN_META_EXCELL', CURRENT_DATE - 1, 2000, 'api_sync', 'Settimana 3 Meta', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAMPAIGN_GOOGLE_EXCELL', CURRENT_DATE - 10, 1200, 'manual', 'CPC Google', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAMPAIGN_GOOGLE_EXCELL', CURRENT_DATE - 5, 1000, 'manual', 'Display Google', 'UUID_AMM_EXCELL'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CAMPAIGN_META_MYMED', CURRENT_DATE - 8, 800, 'manual', 'Meta Salute', 'UUID_AMM_MYMED'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CAMPAIGN_META_MYMED', CURRENT_DATE - 2, 900, 'manual', 'Meta Salute 2', 'UUID_AMM_MYMED'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CAMPAIGN_GOOGLE_MYMED', CURRENT_DATE - 4, 600, 'manual', 'Google Med', 'UUID_AMM_MYMED');

-- 6. Collegare alcuni deal alle campagne (per calcolo ROI)
-- Usa lookup per evitare placeholder
WITH campaign AS (
  SELECT id FROM marketing_campaigns 
  WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681' 
  AND name = 'Black Friday Meta'
  LIMIT 1
)
UPDATE deals 
SET marketing_campaign_id = (SELECT id FROM campaign)
WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681' 
AND id IN (
  SELECT id FROM deals 
  WHERE brand_id = '2dc052de-26b5-48ef-8dee-917ea591a681' 
  ORDER BY created_at 
  LIMIT 4
);
```

### 3.4 Azienda / Amministrazione

```sql
-- ============================================
-- SEED AZIENDA (Budget + Spese)
-- ============================================

-- Categorie spese per Excell
INSERT INTO expense_categories (brand_id, name, is_active)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Personale', true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Affitto', true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Utilities', true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Software', true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'Marketing', true)
RETURNING id, name;

-- Budget mensile Excell
INSERT INTO budgets (brand_id, category_id, period_month, planned_amount, created_by, notes)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_PERSONALE', DATE_TRUNC('month', CURRENT_DATE), 50000, 'UUID_ADMIN', 'Budget personale mese corrente'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_AFFITTO', DATE_TRUNC('month', CURRENT_DATE), 5000, 'UUID_ADMIN', 'Budget affitto'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_MARKETING', DATE_TRUNC('month', CURRENT_DATE), 10000, 'UUID_ADMIN', 'Budget marketing');

-- Spese Excell (10 righe con categorie diverse)
INSERT INTO expenses (brand_id, category_id, expense_date, amount, description, vendor_name, created_by)
VALUES 
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_PERSONALE', CURRENT_DATE - 20, 25000, 'Stipendi prima metà', 'Payroll', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_PERSONALE', CURRENT_DATE - 5, 25000, 'Stipendi seconda metà', 'Payroll', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_AFFITTO', CURRENT_DATE - 25, 5000, 'Affitto ufficio', 'Immobiliare SpA', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_UTILITIES', CURRENT_DATE - 15, 800, 'Bolletta luce', 'Enel', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_UTILITIES', CURRENT_DATE - 12, 300, 'Bolletta gas', 'ENI', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_SOFTWARE', CURRENT_DATE - 8, 500, 'Licenze software', 'Microsoft', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_SOFTWARE', CURRENT_DATE - 3, 200, 'Abbonamento CRM', 'Salesforce', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_MARKETING', CURRENT_DATE - 10, 2000, 'Evento fieristico', 'Fiera Milano', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'CAT_MARKETING', CURRENT_DATE - 2, 1500, 'Materiale promozionale', 'Tipografia', 'UUID_AMM_EXCELL'),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', NULL, CURRENT_DATE - 1, 350, 'Spese varie', 'Vari', 'UUID_AMM_EXCELL');
```

### 3.5 Tickets - Brand MyMed

> ⚠️ **SCHEMA REALE VERIFICATO**:
> - Colonna assegnazione: `assigned_to_user_id` (non `assigned_to`)
> - Colonna titolo: `title` (non `subject`)
> - `ticket_status` enum: `open` | `in_progress` | `resolved` | `closed` | `reopened`
> - `priority`: INTEGER (1=urgente, 5=bassa)
> - `created_by` enum: `user` | `ai` | `system`

```sql
-- ============================================
-- SEED TICKETS MYMED (Schema-compliant)
-- ============================================

-- Prima: recuperare contact_id da MyMed
-- SELECT id, email FROM contacts WHERE brand_id = '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5';
-- Salvare UUID per lookup

-- Pattern deterministico con CTE per evitare placeholder
WITH mymed_contacts AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM contacts 
  WHERE brand_id = '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5'
  LIMIT 8
),
operators AS (
  SELECT u.id, ur.role
  FROM public.users u
  JOIN user_roles ur ON u.id = ur.user_id
  WHERE ur.brand_id = '4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5'
  AND ur.role = 'operatore_callcenter'
  LIMIT 2
)
-- Poi usare nelle INSERT sotto

-- 20 ticket con distribuzione:
-- 10 assegnati, 5 SLA warning, 5 SLA breach

-- Ticket assegnati (status: open/in_progress)
INSERT INTO tickets (brand_id, contact_id, assigned_to_user_id, status, priority, title, description, opened_at)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM1', 'UUID_OP1', 'open', 2, 'Richiesta informazioni', 'Info prodotto', NOW() - INTERVAL '1 hour'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM2', 'UUID_OP1', 'open', 3, 'Problema tecnico', 'Non riesco a...', NOW() - INTERVAL '2 hours'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM3', 'UUID_OP2', 'open', 2, 'Domanda commerciale', 'Vorrei sapere...', NOW() - INTERVAL '30 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM4', 'UUID_OP2', 'in_progress', 3, 'Assistenza', 'Richiesta assistenza', NOW() - INTERVAL '45 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM5', 'UUID_OP1', 'in_progress', 2, 'Follow-up', 'Seguito chiamata', NOW() - INTERVAL '1 hour'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM6', 'UUID_OP2', 'open', 4, 'Bassa priorità', 'Richiesta generica', NOW() - INTERVAL '20 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM7', 'UUID_OP1', 'open', 3, 'Consulenza', 'Richiesta consulenza', NOW() - INTERVAL '3 hours'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM8', 'UUID_OP2', 'open', 2, 'Preventivo', 'Richiesta preventivo', NOW() - INTERVAL '90 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM1', 'UUID_OP1', 'open', 3, 'Secondo ticket', 'Altra richiesta', NOW() - INTERVAL '4 hours'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM2', 'UUID_OP2', 'open', 2, 'Ricontatto', 'Da ricontattare', NOW() - INTERVAL '2 hours');

-- Ticket NON assegnati (per test round robin)
INSERT INTO tickets (brand_id, contact_id, assigned_to_user_id, status, priority, title, description, opened_at)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM3', NULL, 'open', 1, 'URGENTE', 'Ticket urgente non assegnato', NOW() - INTERVAL '10 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM4', NULL, 'open', 2, 'Da assegnare', 'Ticket da assegnare', NOW() - INTERVAL '5 minutes');

-- Ticket in SLA warning (priorità alta, vicini a breach)
INSERT INTO tickets (brand_id, contact_id, assigned_to_user_id, status, priority, title, description, opened_at)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM5', 'UUID_OP1', 'open', 1, 'SLA Warning 1', 'Ticket vicino a breach', NOW() - INTERVAL '50 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM6', 'UUID_OP2', 'open', 1, 'SLA Warning 2', 'Ticket vicino a breach', NOW() - INTERVAL '55 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM7', NULL, 'open', 1, 'SLA Warning 3', 'Urgente non assegnato', NOW() - INTERVAL '45 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM8', 'UUID_OP1', 'open', 2, 'SLA Warning 4', 'Priorità 2 vecchio', NOW() - INTERVAL '100 minutes'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM1', 'UUID_OP2', 'open', 2, 'SLA Warning 5', 'Priorità 2 vecchio', NOW() - INTERVAL '110 minutes');

-- Ticket in SLA breach (priorità 1 oltre 60 min, priorità 2 oltre 120 min)
-- Questi avranno sla_breached_at popolato dal sistema o manualmente
INSERT INTO tickets (brand_id, contact_id, assigned_to_user_id, status, priority, title, description, opened_at, sla_breached_at)
VALUES 
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM2', 'UUID_OP1', 'open', 1, 'SLA BREACH 1', 'URGENTE - Oltre SLA', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM3', 'UUID_OP2', 'open', 1, 'SLA BREACH 2', 'URGENTE - Oltre SLA', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM4', NULL, 'open', 1, 'SLA BREACH 3', 'URGENTE NON ASSEGNATO', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM5', 'UUID_OP1', 'open', 2, 'SLA BREACH 4', 'Priorità 2 scaduto', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour'),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'CONTACT_MM6', 'UUID_OP2', 'open', 2, 'SLA BREACH 5', 'Priorità 2 scaduto', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours');

-- NOTA: Sostituire CONTACT_MM1..MM8 e UUID_OP1/UUID_OP2 con UUID reali
-- oppure usare il pattern CTE sopra per lookup dinamico
```

---

## 4. Matrice Permessi Completa

### 4.1 Navigazione Sidebar

| Menu | Route | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|------|-------|-------|-----|------|-----------|---------|-----------|-------|
| Dashboard | `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Contatti | `/contacts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Eventi | `/events` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pipeline | `/pipeline` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Vendite | `/sales` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Appuntamenti | `/appointments` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ticket | `/tickets` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Chat | `/chat` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Azienda** | `/azienda/*` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Marketing** | `/marketing/*` | Full | Full | Sub | Dash | Dash | ❌ | ❌ |
| Analytics | `/admin/*` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Team | `/team` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| KPI Venditori | `/team/salespersons` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Settings | `/settings` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legenda**: 
- ✅ = Visibile e accessibile
- ❌ = Nascosto/bloccato
- **Full** = Submenu completo (Dashboard + Campagne + Costi + Report)
- **Sub** = Submenu limitato (Dashboard + Costi + Report, NO Campagne CRUD)
- **Dash** = Solo Dashboard KPI (no sottopagine)

### 4.2 Pipeline (Azioni CRUD)

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Visualizza Kanban | ✅ | ✅ | 👁️ | ✅ | 👁️ | Own | ❌ |
| Crea deal | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Modifica deal | ✅ | ✅ | ❌ | ✅ | ❌ | Own | ❌ |
| Drag & Drop | ✅ | ✅ | ❌ | ✅ | ❌ | Own | ❌ |
| Assegna venditore | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Elimina deal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legenda**:
- 👁️ = Solo lettura
- **Own** = Solo deal dove `assigned_user_id = auth.uid()`

### 4.3 Marketing

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Dashboard KPI | ✅ | ✅ | ✅ | 👁️ | 👁️ | ❌ | ❌ |
| Campagne: Lista | ✅ | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ |
| Campagne: CRUD | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Costi: Lista | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Costi: CRUD | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Report + Export | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> Riferimento dettagliato: [docs/marketing-qa-checklist.md](./marketing-qa-checklist.md)

### 4.4 Team / Gestione Utenti

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Lista team brand | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Invita utente | ✅ | ✅ | ❌ | ✅* | ✅* | ❌ | ❌ |
| Modifica ruolo | ✅ | ✅ | ❌ | ✅* | ✅* | ❌ | ❌ |
| Disattiva utente | ✅ | ✅ | ❌ | ✅* | ✅* | ❌ | ❌ |
| Reset password | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Nota `*`**: 
- `resp_vend` può gestire solo ruoli: `venditore`, `sales`
- `resp_cc` può gestire solo ruoli: `operatore_callcenter`, `callcenter`

### 4.5 Azienda / Amministrazione

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Overview azienda | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Budget: Lista | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Budget: CRUD | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Spese: Lista | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Spese: CRUD | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Report finanziari | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 4.6 Tickets

| Azione | admin | ceo | amm. | resp_vend | resp_cc | venditore | op_cc |
|--------|-------|-----|------|-----------|---------|-----------|-------|
| Lista ticket | ✅ | ✅ | 👁️ | 👁️ | ✅ | ❌ | ✅ |
| Crea ticket | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Modifica ticket | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Own |
| Assegna ticket | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Chiudi ticket | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Own |
| Bulk actions | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## 5. Checklist Test per Modulo

### 5.1 Autenticazione

| ID | Test | Ruolo | Expected | Esito |
|----|------|-------|----------|-------|
| AUTH-01 | Login con credenziali valide | Tutti | Redirect a dashboard | [ ] |
| AUTH-02 | Login con password errata | Tutti | Errore "Credenziali non valide" | [ ] |
| AUTH-03 | Logout | Tutti | Redirect a login | [ ] |
| AUTH-04 | Refresh pagina mantiene sessione | Tutti | Utente resta loggato | [ ] |
| AUTH-05 | Token scaduto → ricarica | Tutti | Refresh automatico o redirect login | [ ] |
| AUTH-06 | Forgot password flow | Tutti | Email inviata | [ ] |

### 5.2 Brand Selector

| ID | Test | Ruolo | Expected | Esito |
|----|------|-------|----------|-------|
| BRAND-01 | Admin vede tutti i brand | admin | Lista completa + "Tutti i brand" | [ ] |
| BRAND-02 | CEO vede tutti i brand | ceo | Lista completa + "Tutti i brand" | [ ] |
| BRAND-03 | Venditore vede solo suo brand | venditore | Solo Excell | [ ] |
| BRAND-04 | Operatore vede solo suo brand | op_cc | Solo MyMed | [ ] |
| BRAND-05 | Switch brand aggiorna dati | admin | Dati cambiano, no cache sporca | [ ] |
| BRAND-06 | "Tutti i brand" aggrega correttamente | ceo | KPI sommano, no duplicati | [ ] |

### 5.3 Pipeline

| ID | Test | Ruolo | Brand | Precondizioni | Steps | Expected | Esito |
|----|------|-------|-------|---------------|-------|----------|-------|
| PIPE-01 | Kanban load | admin | Excell | Seed applicato | Apri /pipeline | Colonne + deal visibili | [ ] |
| PIPE-02 | Crea nuovo deal | admin | Excell | - | Click "Nuovo Deal", compila, salva | Deal appare in prima colonna | [ ] |
| PIPE-03 | Drag&drop persiste | admin | Excell | Deal in "Nuovo" | Trascina in "Lavorazione", refresh | Deal resta in "Lavorazione" | [ ] |
| PIPE-04 | Modifica deal | admin | Excell | Deal esistente | Click deal, modifica valore, salva | Valore aggiornato | [ ] |
| PIPE-05 | Assegna venditore | resp_vend | Excell | Deal senza assegnatario | Seleziona venditore1 | Badge iniziali visibile | [ ] |
| PIPE-06 | Drag su "Vinto" | admin | Excell | Deal open | Trascina su colonna "Vinto" | status=won, closed_at valorizzato | [ ] |
| PIPE-07 | Drag su "Perso" | admin | Excell | Deal open | Trascina su colonna "Perso" | status=lost, closed_at valorizzato | [ ] |
| PIPE-08 | Venditore vede solo propri deal | venditore1 | Excell | 4 deal assegnati | Apri /pipeline | Solo 4 deal visibili | [ ] |
| PIPE-09 | Venditore NON può drag deal altri | venditore1 | Excell | Deal venditore2 | Tentare drag | Azione bloccata o deal non visibile | [ ] |
| PIPE-10 | Amministrazione read-only | amm. | Excell | - | Apri /pipeline | Kanban visibile, NO drag, NO modifica | [ ] |
| PIPE-11 | Operatore NO accesso pipeline | op_cc | MyMed | - | Vai a /pipeline | Redirect o 403 | [ ] |
| PIPE-12 | Badge campagna marketing | admin | Excell | Deal con campaign_id | Apri deal | Badge campagna visibile | [ ] |
| PIPE-13 | Deal detail sheet | admin | Excell | Deal esistente | Click su card | Sheet apre senza errori | [ ] |
| PIPE-14 | Filtro per stage | admin | Excell | Multi-stage | Usa filtro | Solo deal dello stage filtrato | [ ] |
| PIPE-15 | Ricerca deal | admin | Excell | Deal "Mario Rossi" | Cerca "Mario" | Deal trovato | [ ] |

### 5.4 Marketing

> Riferimento completo: [docs/marketing-qa-checklist.md](./marketing-qa-checklist.md)

| ID | Test | Ruolo | Expected | Esito |
|----|------|-------|----------|-------|
| MKT-01 | Dashboard KPI load | admin | KPI cards visibili, no errori | [ ] |
| MKT-02 | ROI calcolato correttamente | admin | (Ricavi-Costi)/Costi × 100 | [ ] |
| MKT-03 | Crea campagna | admin | Campagna creata | [ ] |
| MKT-04 | Amministrazione NO crea campagna | amm. | Pulsante nascosto | [ ] |
| MKT-05 | Amministrazione crea costo | amm. | Costo creato | [ ] |
| MKT-06 | Responsabile solo dashboard | resp_vend | Solo /marketing visibile | [ ] |
| MKT-07 | Venditore NO accesso | venditore | Menu nascosto | [ ] |

### 5.5 Team / Gestione Utenti

| ID | Test | Ruolo | Brand | Expected | Esito |
|----|------|-------|-------|----------|-------|
| TEAM-01 | Lista team | admin | Excell | Tutti i membri del brand | [ ] |
| TEAM-02 | Invita utente | admin | Excell | Utente creato con ruolo | [ ] |
| TEAM-03 | Cambia ruolo | admin | Excell | Ruolo aggiornato | [ ] |
| TEAM-04 | Disattiva utente | admin | Excell | is_active=false | [ ] |
| TEAM-05 | Resp vendite invita venditore | resp_vend | Excell | Funziona | [ ] |
| TEAM-06 | Resp vendite NO invita operatore | resp_vend | Excell | Ruolo non selezionabile | [ ] |
| TEAM-07 | Resp callcenter gestisce operatori | resp_cc | MyMed | Lista + CRUD ok | [ ] |
| TEAM-08 | Venditore NO accesso team | venditore | Excell | Menu nascosto | [ ] |

### 5.6 KPI Venditori

| ID | Test | Ruolo | Brand | Expected | Esito |
|----|------|-------|-------|----------|-------|
| KPI-01 | Load KPI page | admin | Excell | Cards + tabella visibili | [ ] |
| KPI-02 | Filtro 7 giorni | admin | Excell | Dati filtrati correttamente | [ ] |
| KPI-03 | Filtro 30 giorni | admin | Excell | Dati filtrati correttamente | [ ] |
| KPI-04 | Total value won corretto | admin | Excell | Somma deal won | [ ] |
| KPI-05 | Win rate corretto | admin | Excell | won/(won+lost) × 100 | [ ] |
| KPI-06 | Avg days to close sensato | admin | Excell | Media giorni apertura→chiusura | [ ] |
| KPI-07 | Resp venditori vede team | resp_vend | Excell | Tabella venditori brand | [ ] |
| KPI-08 | Venditore NO accesso | venditore | Excell | Redirect o 403 | [ ] |

### 5.7 Azienda / Amministrazione

| ID | Test | Ruolo | Brand | Expected | Esito |
|----|------|-------|-------|----------|-------|
| AZ-01 | Overview carica | admin | Excell | KPI aziendali visibili | [ ] |
| AZ-02 | Budget: lista | amm. | Excell | Budget visibili | [ ] |
| AZ-03 | Budget: crea | amm. | Excell | Budget creato | [ ] |
| AZ-04 | Budget: modifica | amm. | Excell | Budget aggiornato | [ ] |
| AZ-05 | Spese: lista | amm. | Excell | Spese visibili | [ ] |
| AZ-06 | Spese: crea | amm. | Excell | Spesa creata | [ ] |
| AZ-07 | Spese: filtro date | amm. | Excell | Solo spese nel range | [ ] |
| AZ-08 | "Tutti i brand" aggrega | ceo | Tutti | Somma cross-brand | [ ] |
| AZ-09 | Resp venditori NO accesso | resp_vend | Excell | Menu nascosto | [ ] |

### 5.8 Tickets

| ID | Test | Ruolo | Brand | Expected | Esito |
|----|------|-------|-------|----------|-------|
| TKT-01 | Lista ticket | op_cc | MyMed | Ticket visibili | [ ] |
| TKT-02 | Coda "Miei Ticket" | op_cc | MyMed | Solo assigned_to=me | [ ] |
| TKT-03 | Coda "Non assegnati" | op_cc | MyMed | assigned_to IS NULL | [ ] |
| TKT-04 | Coda "SLA Breach" | op_cc | MyMed | Ticket oltre SLA | [ ] |
| TKT-05 | Crea ticket | op_cc | MyMed | Ticket creato | [ ] |
| TKT-06 | Modifica ticket proprio | op_cc | MyMed | Modifiche salvate | [ ] |
| TKT-07 | Assegna ticket (resp) | resp_cc | MyMed | Assegnazione ok | [ ] |
| TKT-08 | Bulk close (resp) | resp_cc | MyMed | Multi-close ok | [ ] |
| TKT-09 | Venditore NO accesso | venditore | Excell | Redirect o 403 | [ ] |
| TKT-10 | Audit trail visibile | admin | MyMed | Timeline modifiche | [ ] |

### 5.9 Chat / AI / Notifiche

| ID | Test | Ruolo | Expected | Esito |
|----|------|-------|----------|-------|
| CHAT-01 | Invio messaggio | Tutti | Messaggio appare | [ ] |
| CHAT-02 | Realtime riceve messaggi | Tutti | Aggiornamento live | [ ] |
| NOTIF-01 | Notifiche caricano | Tutti | Lista notifiche | [ ] |
| NOTIF-02 | Mark as read | Tutti | Notifica marcata letta | [ ] |
| AI-01 | AI tab accessibile | admin | Pagina carica | [ ] |
| AI-02 | AI chat funziona | admin | Risposta ricevuta | [ ] |

---

## 6. Test Tecnici

### 6.1 Console Errors

**Procedura**:
1. Aprire DevTools → Console
2. Navigare ogni pagina principale
3. Eseguire azioni CRUD
4. Verificare: **0 errori rossi** (warning accettabili se motivati)

| Pagina | Azioni testate | Errori | Note |
|--------|----------------|--------|------|
| /pipeline | Load, drag, edit | | |
| /marketing | Load, KPI | | |
| /team | Load, list | | |
| /tickets | Load, filter | | |
| /settings | Load | | |

### 6.2 Network Sanity

**Per ogni pagina verificare**:
- [ ] Nessuna 401 (token valido)
- [ ] Nessuna 403 (permessi corretti)
- [ ] Nessuna 500 (server ok)
- [ ] Payload contengono `brand_id` dove richiesto
- [ ] Response times < 2s per operazioni normali

### 6.3 RLS Attack Test

> ⚠️ **NOTA**: Con le RLS policy di Supabase, l'expected primario è **0 record** (non 403). 
> Il 403 si ottiene solo se c'è un endpoint/Edge Function che valida esplicitamente i permessi.

**Procedura Cross-Brand**:
```text
1. Login come venditore1 (brand: Excell)
2. Aprire DevTools → Network
3. Trovare una richiesta GET verso /deals o /contacts
4. Copiare la richiesta come cURL
5. Modificare brand_id con UUID di MyMed (4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5)
6. Eseguire la richiesta modificata
7. Expected: 0 record restituiti (le RLS bloccano silenziosamente)
```

**Test da eseguire**:

| Risorsa | Utente | Brand attacco | Expected | Esito |
|---------|--------|---------------|----------|-------|
| deals | venditore1 (Excell) | MyMed | **0 record** | [ ] |
| contacts | op_cc (MyMed) | Excell | **0 record** | [ ] |
| tickets | op_cc (MyMed) | Excell | **0 record** | [ ] |
| expenses | amm (Excell) | MyMed | **0 record** | [ ] |

> **Nota**: Se ricevi 403 su Edge Functions (es. `admin-manage-team`), è accettabile in quanto queste validano esplicitamente i permessi.

### 6.4 Performance Base

| Test | Condizioni | Expected | Esito |
|------|------------|----------|-------|
| Pipeline 50 deal | 50 deal nel brand | Load < 2s | [ ] |
| Pipeline 200 deal | 200 deal nel brand | Load < 5s, no freeze | [ ] |
| Contacts 500 righe | 500 contatti | Scroll fluido | [ ] |
| Tickets 100 righe | 100 ticket | Paginazione funziona | [ ] |

---

## 7. Smoke Test (10 Critici)

**Questi 10 test vanno eseguiti SEMPRE dopo ogni deploy o fix.**

| # | Test | Ruolo | Brand | Pass/Fail |
|---|------|-------|-------|-----------|
| 1 | Login admin → brand Excell → pipeline load | admin | Excell | [ ] |
| 2 | Drag&drop deal → refresh → deal persiste nella nuova colonna | admin | Excell | [ ] |
| 3 | Assegna venditore a deal → badge iniziali visibile | resp_vend | Excell | [ ] |
| 4 | KPI venditori caricano con numeri coerenti al dataset | admin | Excell | [ ] |
| 5 | Marketing dashboard: costi e ricavi coerenti con seed | admin | Excell | [ ] |
| 6 | Crea costo marketing come "amministrazione" → visibile in dashboard | amm. | Excell | [ ] |
| 7 | Venditore: vede pipeline ma NON vede pagine Marketing/Team | venditore | Excell | [ ] |
| 8 | Operatore callcenter: NON vede pipeline/venditori | op_cc | MyMed | [ ] |
| 9 | Switch brand Excell↔MyMed: dati corretti, cache pulita | admin | Entrambi | [ ] |
| 10 | "Tutti i brand" (CEO): aggregazione senza duplicati | ceo | Tutti | [ ] |

---

## 8. Regression Test (Post-Fix)

**Dopo ogni fix, eseguire questi test + eventuali test specifici per l'area modificata.**

| # | Area | Test | Frequenza |
|---|------|------|-----------|
| 1 | Auth | Login/logout funziona | Sempre |
| 2 | Pipeline | Drag&drop persiste | Sempre |
| 3 | Pipeline | Assegnazione venditore | Se modificato Pipeline |
| 4 | Marketing | KPI dashboard | Se modificato Marketing |
| 5 | Team | Lista + invito | Se modificato Team |
| 6 | Tickets | Coda + assegnazione | Se modificato Tickets |
| 7 | RLS | Cross-brand blocked | Se modificato RLS/DB |
| 8 | Brand | Switch brand pulisce cache | Se modificato Brand logic |
| 9 | Performance | Pipeline 100 deal | Se modificato query |
| 10 | Console | 0 errori rossi | Sempre |

---

## 9. Template Bug Report

```markdown
## BUG-XXX: [Titolo breve e descrittivo]

**Severità**: [ ] Blocker [ ] Critical [ ] Major [ ] Minor
**Ambiente**: [ ] Production [ ] Staging [ ] Preview [ ] Local
**Browser**: [es. Chrome 120, Safari 17]
**Ruolo**: [es. venditore]
**Brand**: [es. Excell]

### Passi per riprodurre
1. Login come [ruolo] su brand [brand]
2. Navigare a [pagina]
3. Eseguire [azione]
4. Osservare [comportamento]

### Comportamento atteso
[Descrizione di cosa dovrebbe succedere]

### Comportamento attuale
[Descrizione di cosa succede effettivamente]

### Screenshot/Video
[Allegare screenshot o link a video]

### Console Log
```
[Incollare errori dalla console del browser]
```

### Network Log
- **Request URL**: [URL della richiesta fallita]
- **Request Method**: [GET/POST/PUT/DELETE]
- **Request Body**: 
```json
[Body della richiesta]
```
- **Response Status**: [es. 500, 403]
- **Response Body**:
```json
[Body della risposta]
```

### Possibile causa
- **File sospetto**: [es. src/hooks/usePipeline.ts]
- **Funzione**: [es. updateDealStage]
- **Ipotesi**: [Breve descrizione del possibile problema]

### Workaround
[Se esiste un modo per aggirare temporaneamente il problema]

### Note aggiuntive
[Altre informazioni utili]
```

---

## 10. Deliverable QA

### 10.1 Documenti da Produrre

| # | Documento | Contenuto | Formato |
|---|-----------|-----------|---------|
| 1 | `docs/platform-qa-checklist.md` | Questo documento compilato con PASS/FAIL | Markdown |
| 2 | `docs/qa-run-report-YYYY-MM-DD.md` | Report esecuzione specifico | Markdown |
| 3 | Bug list | Lista ticket pronta per Jira/Notion | Markdown/CSV |

### 10.2 Contenuto Report Esecuzione

```markdown
# QA Run Report - [DATA]

## Informazioni Esecuzione
- **Data**: YYYY-MM-DD
- **Esecutore**: [Nome]
- **Ambiente**: [Staging/Preview]
- **Commit/Versione**: [hash]

## Utenti Utilizzati
| # | Email | Ruolo | Brand | Creato con |
|---|-------|-------|-------|------------|
| 1 | ... | ... | ... | Edge Function |

## Dataset Seed
- [ ] Seed Pipeline Excell applicato
- [ ] Seed Pipeline MyMed applicato
- [ ] Seed Marketing applicato
- [ ] Seed Azienda applicato
- [ ] Seed Tickets applicato

## Risultati per Modulo

### Autenticazione: X/6 PASS
[Dettagli]

### Brand Selector: X/6 PASS
[Dettagli]

### Pipeline: X/15 PASS
[Dettagli]

### Marketing: X/7 PASS
[Dettagli]

### Team: X/8 PASS
[Dettagli]

### KPI Venditori: X/8 PASS
[Dettagli]

### Azienda: X/9 PASS
[Dettagli]

### Tickets: X/10 PASS
[Dettagli]

## Smoke Test: X/10 PASS
[Dettagli]

## Bug Trovati

| ID | Titolo | Severità | Stato |
|----|--------|----------|-------|
| BUG-001 | ... | Critical | Open |

## Raccomandazione

[ ] **GO** - Pronto per release
[ ] **NO GO** - Blockers presenti
[ ] **GO con riserva** - Minor issues, monitorare

## Note
[Osservazioni generali]
```

---

## Riferimenti

- [Marketing QA Checklist](./marketing-qa-checklist.md) - Test dettagliati modulo Marketing
- [Decisions](./decisions.md) - Decisioni architetturali
- [Troubleshooting](./troubleshooting.md) - Problemi comuni e soluzioni
- Edge Function `admin-manage-team` - Creazione/gestione utenti
- Edge Function `admin-manage-users` - Operazioni admin globali
