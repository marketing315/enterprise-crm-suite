# Piano Finale v2: Campi Lead Estesi + Sistema Clinical Topics Scalabile

## Panoramica

Questo piano espande il sistema di gestione lead e appuntamenti con nuovi campi per la qualificazione del cliente. L'approccio chiave e' l'uso di un **vocabolario controllato e scalabile** per gli interessi clinici, che permette all'AI e agli operatori di proporre nuovi termini senza rompere lo schema.

---

# CRM Enterprise Features - Implementation Plan (v2)

## Overview
This section outlines the implementation plan for 5 major CRM features, ordered by dependency.

## Implementation Order

### 1. Pipeline CRUD (add/remove/rename/reorder) ✅
**Status**: In Progress  
**Priority**: P0 - Unlocks everything else

#### Database
- `pipeline_stages(id, brand_id, name, order_index, is_active, color, description, created_at, updated_at)`
- Constraint: `unique(brand_id, lower(name)) where is_active=true`
- Soft delete: `is_active=false` with fallback stage handling

#### API/RPC
- `create_pipeline_stage(brand_id, name, color, order_index)` - Create new stage
- `update_pipeline_stage(stage_id, name, color)` - Update stage
- `reorder_pipeline_stages(stage_ids[])` - Reorder stages
- `deactivate_pipeline_stage(stage_id, fallback_stage_id)` - Soft delete with fallback

#### UI
- Settings → Pipeline Stages tab
- Drag & drop reorder
- Inline rename
- Add new stage button
- Deactivate with warning dialog

---

### 2. AI Autotagging + Initial Stage ⏳
**Status**: Pending  
**Depends on**: Pipeline CRUD

#### Database
- `ai_decision_logs` table (already exists)
- `deals.stage_locked_by_user` boolean flag
- `tag_assignments` with `assigned_by='ai'`

#### Flow
1. `lead_event` created → normalize → resolve contact → create/find deal
2. Enqueue `ai_decide(lead_event_id)`
3. AI produces JSON: `{ priority, initial_stage, tags_to_apply, rationale }`
4. Apply:
   - Set stage on deal (if not locked by user)
   - Create tag_assignments (assigned_by='ai')
   - Save to ai_decision_logs

#### Rules
- If contact is `archived_optout`: no appointment/ticket, archive event
- Human override: set `stage_locked_by_user=true` on deal

#### UI
- AI Decision box in event/deal detail
- Priority, suggested tags, stage, rationale
- Apply/Restore/Ignore buttons

---

### 3. In-App Notifications ⏳
**Status**: Pending  
**Depends on**: Pipeline CRUD, AI Autotagging

#### Database
```sql
notifications(
  id, brand_id, user_id, 
  type, title, body, 
  entity_type, entity_id, 
  read_at, created_at
)

notification_preferences(
  id, user_id, brand_id,
  notification_type, enabled,
  created_at
)
```

#### Trigger Events
- `lead_event_created` (priority >= X or specific sources)
- `pipeline_stage_changed`
- `tags_updated`
- `appointment_created/updated`
- `ticket_status_changed`
- `ticket_assigned`

#### Delivery
- Supabase Realtime subscription
- Badge counter in sidebar
- Dropdown notification center

---

### 4. Employee Chat (Thread-based) ⏳
**Status**: Pending  
**Depends on**: Notifications

#### Database
```sql
chat_threads(
  id, brand_id, 
  type ('direct'|'group'|'entity'),
  entity_type, entity_id,
  title,
  created_by, created_at
)

chat_thread_members(
  thread_id, user_id, 
  role ('member'|'admin'),
  joined_at, left_at
)

chat_messages(
  id, thread_id, brand_id,
  sender_user_id, sender_type ('user'|'ai'),
  message_text, attachments jsonb,
  created_at, edited_at, deleted_at
)

chat_message_reads(
  message_id, user_id, read_at
)
```

#### Thread Types
- **Direct**: 1:1 between users
- **Group**: Team channels
- **Entity**: Attached to contact/deal/ticket/appointment (killer CRM feature)

#### UI
- Sidebar "Chat" tab
- Entity detail → "Discussion" box opens entity thread
- Realtime message updates

#### Security (RLS)
- Access only if thread member + brand match
- Admin/CEO can view all threads in their brands

---

### 5. AI Chat Assistant ⏳
**Status**: Pending  
**Depends on**: Employee Chat

#### UX Model
- Toggle in entity threads: "Write to team" / "Ask AI"
- Or prefix with `/ai ...`

#### AI Capabilities (Tools)
- Summarize contact timeline
- Suggest next action (call script, follow-up)
- Propose tags/stage with rationale
- Generate response drafts (email/WhatsApp)

#### Database
- Reuse `chat_messages` with `sender_type='ai'`
- Log `prompt_version` + redacted input context for audit

#### Security
- AI receives only brand data + user-accessible entities
- Respect RLS boundaries

---

## Definition of Done

| Feature | Acceptance Criteria |
|---------|---------------------|
| Pipeline CRUD | Admin can create/rename/reorder/deactivate stages; deals auto-migrate to fallback |
| AI Autotagging | LeadEvent → AI decision → stage + tags applied with human override |
| Notifications | Realtime in-app notifications for key events with badge counter |
| Employee Chat | Working team chat with threads attachable to deals/tickets |
| AI Chat | AI assistant in entity threads produces useful + auditable output |

---

## Technical Notes

### RLS Pattern
All new tables use the established pattern:
- `user_belongs_to_brand(get_user_id(auth.uid()), brand_id)` for SELECT
- `has_role_for_brand(...)` for admin operations

### Realtime
Enable realtime for:
- `notifications`
- `chat_messages`
- `chat_message_reads`

### Audit
All significant actions logged to `audit_log` table with:
- `actor_user_id`, `entity_type`, `entity_id`, `action`, `old_value`, `new_value`

---

## Fase 1 (Legacy): Schema Database - Nuove Tabelle e Colonne

### 1.1 Nuovi Tipi ENUM

```text
lead_source_channel   -> 'tv', 'online', 'other'
contact_channel       -> 'chat', 'call'
pacemaker_status      -> 'assente', 'presente', 'non_chiaro'
customer_sentiment    -> 'positivo', 'neutro', 'negativo'
decision_status       -> 'pronto', 'indeciso', 'non_interessato'
objection_type        -> 'prezzo', 'tempo', 'fiducia', 'altro'
appointment_type      -> 'primo_appuntamento', 'follow_up', 'visita_tecnica'
topic_created_by      -> 'ai', 'user'
```

### 1.2 Funzione DB `normalize_topic_text` (Unicode-Safe)

**Scopo**: Unica funzione per normalizzare testo topic/alias. Garantisce match consistente ovunque.

```sql
CREATE OR REPLACE FUNCTION normalize_topic_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    trim(
      regexp_replace(
        regexp_replace(p_text, '[[:punct:]]', ' ', 'g'),  -- rimuovi punteggiatura (unicode-safe)
        '\s+', ' ', 'g'                                    -- collapse spazi multipli
      )
    )
  )
$$;
```

**Note**: Usa `[[:punct:]]` invece di `[^\w\s]` per compatibilita unicode/italiano.

**Usata in**: upsert_clinical_topics_from_strings, inserimento manuale UI, qualsiasi ricerca.

### 1.3 Tabella `clinical_topics` (Vocabolario Controllato)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | uuid | PK |
| `brand_id` | uuid | FK -> brands |
| `canonical_name` | text | Nome visualizzato (es. "Schiena") |
| `slug` | text | Versione normalizzata (es. "schiena") |
| `created_by` | topic_created_by | Chi ha creato (ai/user) |
| `needs_review` | boolean | Da rivedere da admin? (default true) |
| `is_active` | boolean | Se visibile (default true) |
| `created_at` | timestamptz | Data creazione |

**Constraint**: UNIQUE(brand_id, slug)
**Indice**: (brand_id, is_active) per filtri frequenti

### 1.4 Tabella `clinical_topic_aliases` (Mappatura Sinonimi)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | uuid | PK |
| `brand_id` | uuid | FK -> brands |
| `topic_id` | uuid | FK -> clinical_topics |
| `alias_text` | text | Testo SEMPRE normalizzato |
| `created_by` | topic_created_by | Chi ha creato |
| `created_at` | timestamptz | Data creazione |

**Constraint**: UNIQUE(brand_id, alias_text)
**Trigger OBBLIGATORIO**: Prima di insert/update, applica `normalize_topic_text(alias_text)`

```sql
CREATE OR REPLACE FUNCTION normalize_alias_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.alias_text := normalize_topic_text(NEW.alias_text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_alias
BEFORE INSERT OR UPDATE ON clinical_topic_aliases
FOR EACH ROW EXECUTE FUNCTION normalize_alias_trigger();
```

### 1.5 Join Table `lead_event_clinical_topics`

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `lead_event_id` | uuid | FK -> lead_events |
| `topic_id` | uuid | FK -> clinical_topics |
| `created_at` | timestamptz | Data assegnazione |

**Constraint**: UNIQUE(lead_event_id, topic_id)
**Indici** (entrambi espliciti per performance):
- `(topic_id, lead_event_id)` -- per filtri per topic
- `(lead_event_id, topic_id)` -- per lookup per evento

### 1.6 Nuove Colonne su `lead_events`

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `lead_source_channel` | enum | Fonte (TV, Online, Other) |
| `contact_channel` | enum | Canale contatto (Chat, Call) |
| `pacemaker_status` | enum | Presenza pacemaker |
| `customer_sentiment` | enum | Sentiment cliente |
| `decision_status` | enum | Stato decisionale |
| `objection_type` | enum | Tipo obiezione |
| `booking_notes` | text | Note in corso di prenotazione |
| `ai_conversation_summary` | text | Riassunto conversazione AI |
| `logistics_notes` | text | Logistica (disponibilita, vincoli) |

### 1.7 Nuova Colonna su `contacts`

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `address` | text | Via/Indirizzo completo |

### 1.8 Nuove Colonne su `appointments`

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `appointment_type` | enum | Tipo appuntamento |
| `appointment_order` | int | Ordine (1 = primo, 2 = follow-up) |
| `parent_appointment_id` | uuid | Link al primo appuntamento |

### 1.9 RLS Policies

**clinical_topics**:
- SELECT: `user_belongs_to_brand(user_id, brand_id)`
- INSERT/UPDATE/DELETE: `has_role_for_brand(user_id, brand_id, 'admin')` OR `has_role(user_id, 'ceo')`

**clinical_topic_aliases**:
- SELECT: `user_belongs_to_brand(user_id, brand_id)`
- INSERT/UPDATE/DELETE: `has_role_for_brand(user_id, brand_id, 'admin')` OR `has_role(user_id, 'ceo')`

**lead_event_clinical_topics**:
- SELECT: join su lead_events per brand check
- **NESSUN WRITE DIRETTO**: tutte le modifiche passano esclusivamente via RPC

---

## Fase 2: Nuovi RPC Functions

### 2.1 RPC `upsert_clinical_topics_from_strings`

**Scopo**: Permettere all'AI e agli operatori di proporre interessi clinici in formato testo libero.

**Input**:
- `p_brand_id uuid`
- `p_strings text[]` (es. ["mal di schiena", "lombare", "infiammazione"])

**Comportamento**:
1. Per ogni stringa:
   - Normalizza con `normalize_topic_text()`
   - Cerca match in `clinical_topic_aliases.alias_text`
   - Se trovato: restituisce topic_id esistente
   - Se NON trovato:
     - Crea nuovo `clinical_topics` (canonical_name = Title Case, slug = normalized)
     - Crea `clinical_topic_aliases` con alias_text = normalized
     - `created_by` = parametro passato ('ai' o 'user')
     - `needs_review = true` (sempre per nuovi topic)
2. Restituisce `topic_ids uuid[]`

**Permessi**: SECURITY DEFINER
- Eseguibile da: `service_role`, `admin`, `ceo`, `callcenter`, `sales`
- Tutti i nuovi topic creati da non-admin avranno `needs_review = true`

### 2.2 RPC `set_lead_event_clinical_topics`

**Input**:
- `p_event_id uuid`
- `p_topic_ids uuid[]`

**Comportamento**:
1. Validazione brand ownership
2. **LOCK RIGA**: `SELECT ... FOR UPDATE` su lead_events per evitare race condition
3. **REPLACE TOTALE**: DELETE esistenti per event_id, poi INSERT nuovi
4. **AUDIT LOG**: Scrive entry in `audit_log` con:
   - `entity_type = 'lead_event'`
   - `action = 'topics_updated'`
   - `old_value = [topic_ids precedenti]`
   - `new_value = [topic_ids nuovi]`

**Permessi**: SECURITY DEFINER
- Eseguibile da: `service_role`, `admin`, `ceo`, `callcenter`

### 2.3 Update RPC `search_lead_events`

Aggiungere filtri opzionali:
- `p_clinical_topic_ids uuid[]`
- `p_match_all_topics boolean DEFAULT false`

**Logica**:
- `false` (ANY): evento ha almeno uno dei topic richiesti
- `true` (ALL): evento ha TUTTI i topic richiesti

```sql
-- ANY mode
WHERE EXISTS (
  SELECT 1 FROM lead_event_clinical_topics lect
  WHERE lect.lead_event_id = le.id
  AND lect.topic_id = ANY(p_clinical_topic_ids)
)

-- ALL mode
WHERE (
  SELECT COUNT(DISTINCT lect.topic_id)
  FROM lead_event_clinical_topics lect
  WHERE lect.lead_event_id = le.id
  AND lect.topic_id = ANY(p_clinical_topic_ids)
) = array_length(p_clinical_topic_ids, 1)
```

### 2.4 Update RPC `search_appointments`

Aggiungere alla risposta:
- `brand_name` (per vista "Tutti i brand")

### 2.5 RPC `add_contact_phone` (Pattern Atomico)

**Input**:
- `p_contact_id uuid`
- `p_phone_raw text`
- `p_is_primary boolean` (default false)

**Comportamento** (transazionale):
1. Normalizza telefono
2. `INSERT ... ON CONFLICT (brand_id, phone_normalized) DO NOTHING`
3. Se `p_is_primary = true`:
   - `UPDATE contact_phones SET is_primary = false WHERE contact_id = p_contact_id AND is_primary = true`
   - `UPDATE contact_phones SET is_primary = true WHERE id = nuovo_id`
4. Ritorna ID del record (esistente o nuovo)

---

## Fase 3: Aggiornamento TypeScript Types

### File: `src/types/database.ts`

Nuovi tipi:
- `LeadSourceChannel = 'tv' | 'online' | 'other'`
- `ContactChannel = 'chat' | 'call'`
- `PacemakerStatus = 'assente' | 'presente' | 'non_chiaro'`
- `CustomerSentiment = 'positivo' | 'neutro' | 'negativo'`
- `DecisionStatus = 'pronto' | 'indeciso' | 'non_interessato'`
- `ObjectionType = 'prezzo' | 'tempo' | 'fiducia' | 'altro'`
- `AppointmentType = 'primo_appuntamento' | 'follow_up' | 'visita_tecnica'`
- `TopicCreatedBy = 'ai' | 'user'`

Nuove interfacce:
- `ClinicalTopic`
- `ClinicalTopicAlias`
- `LeadEventClinicalTopic`

Estensioni:
- `LeadEvent` con nuovi campi qualificazione
- `Contact` con `address`
- `Appointment` con `appointment_type`, `appointment_order`, `parent_appointment_id`
- `AppointmentWithRelations` con `brand_name?`

---

## Fase 4: Nuovi Hooks React

### 4.1 `useClinicalTopics.ts`

- Fetch topics per brand (solo `is_active = true`)
- Funzione per creare/proporre topic (chiama RPC, tutti possono proporre)
- Funzione per cercare/filtrare topics (autocomplete)

### 4.2 `useSetLeadEventClinicalTopics.ts`

- Mutation per assegnare topics a un lead event via RPC

### 4.3 Update `useAppointments.ts`

- Supporto multi-appuntamento (parent_id)
- Nuovo parametro `appointmentType`
- Supporto `lead_event_id` associato

### 4.4 Update `useContacts.ts`

- Supporto campo `address`
- Funzione per aggiungere secondo telefono (chiama RPC)

---

## Fase 5: Aggiornamento UI - NewAppointmentDialog

### 5.1 Selezione Brand (in modalita "Tutti i brand")

All'inizio del form, se `isAllBrandsSelected`:

```text
[Brand *] [Seleziona brand v]
```

### 5.2 Selezione/Creazione Lead Event

**Logica importante**: I campi di qualificazione vengono salvati su `lead_events`, non su appointment.

```text
[Evento associato v]
  - Evento del 15/01 (Meta Lead)
  - Evento del 10/01 (Chiamata)
  - [Crea nuovo evento manuale]
```

**Comportamento**:
1. Se contatto ha eventi esistenti: mostra lista, default = ultimo evento
2. Se contatto non ha eventi: crea automaticamente `lead_event` con `source = 'manual'`
3. I campi di qualificazione (sentiment, pacemaker, ecc.) vengono salvati sull'evento selezionato

### 5.3 Sezione Indirizzo Estesa

```text
[Via]                           
[Citta]                 [CAP]
```

### 5.4 Secondo Numero Telefono

```text
[Telefono principale] (read-only, dal contatto)
[Secondo telefono] [____________] [+ Aggiungi]
```

### 5.5 Appuntamenti Multipli

```text
-- Primo Appuntamento --
[Data] [Ora] [Tipo: Primo appuntamento v]

[+ Aggiungi appuntamento follow-up]

-- Follow-up (se aggiunto) --
[Data] [Ora] [Tipo: Follow-up]
[Rimuovi]
```

### 5.6 Sezione Qualificazione Lead (salvata su lead_event)

```text
-- Fonte --
[Fonte v] TV | Online | Other
[Canale v] Chat | Call

-- Interesse Clinico (Multiselect Autocomplete) --
[Cerca o aggiungi interesse clinico...]
  Suggerimenti: Schiena, Articolazioni, ...
  
Selezionati: [Schiena x] [Articolazioni x]
(Badge giallo "Da rivedere" se needs_review=true)

[+ Proponi nuovo] (tutti possono proporre, verra creato con needs_review=true)

-- Valutazione Medica --
[Pacemaker v] Assente | Presente | Non chiaro

-- Valutazione Cliente --
[Sentiment v] Positivo | Neutro | Negativo
[Stato decisionale v] Pronto | Indeciso | Non interessato
[Tipo obiezione v] Prezzo | Tempo | Fiducia | Altro

-- Logistica --
[Disponibilita oraria, vincoli, location...]

-- Note Prenotazione --
[Note in corso di prenotazione...]

-- Riassunto AI --
[Riassunto conversazione AI...] (read-only se popolato)
```

---

## Fase 6: Vista Appuntamenti

### 6.1 Card Appuntamento Estesa

Mostrare:
- **Brand** (se in "Tutti i brand") - badge con colore
- **Tipo appuntamento** - badge (Primo/Follow-up/Visita)
- Secondo telefono se presente

### 6.2 Filtro Brand

Quando in "Tutti i brand", aggiungere dropdown filtro per brand specifico.

---

## Fase 7: (Opzionale) Admin - Gestione Clinical Topics

Pagina per admin in Settings:
- Lista topics con conteggio utilizzi
- Merge duplicati
- Rename/Edit canonical_name
- Toggle is_active
- Badge "Da rivedere" per needs_review=true
- Approvazione batch topics proposti

---

## Ordine di Implementazione

1. **DB Migration** - Tabelle + enum + indici + RLS + `normalize_topic_text` + trigger
2. **RPC** - upsert_clinical_topics, set_lead_event_topics, add_contact_phone, update search_lead_events
3. **Types TS** - Nuovi tipi e interfacce
4. **Hooks** - useClinicalTopics, useSetLeadEventClinicalTopics
5. **UI Form** - NewAppointmentDialog con tutti i nuovi campi
6. **UI Vista** - Appointments page con brand info e tipo

---

## Riepilogo Permessi RPC

| RPC | Eseguibile da | Note |
|-----|---------------|------|
| `upsert_clinical_topics_from_strings` | service_role, admin, ceo, callcenter, sales | Nuovi topic sempre con needs_review=true |
| `set_lead_event_clinical_topics` | service_role, admin, ceo, callcenter | Con lock riga per race condition |
| `add_contact_phone` | admin, ceo, callcenter | Pattern atomico ON CONFLICT |
| `search_lead_events` (con filtro topics) | tutti gli utenti autenticati | Rispetta brand RLS, supporta ANY/ALL |

---

## Files Impattati

| File | Modifica |
|------|----------|
| `supabase/migrations/` | Nuova migrazione SQL completa |
| `src/types/database.ts` | Nuovi tipi |
| `src/hooks/useClinicalTopics.ts` | NUOVO |
| `src/hooks/useSetLeadEventClinicalTopics.ts` | NUOVO |
| `src/hooks/useAppointments.ts` | Estensione |
| `src/hooks/useContacts.ts` | Estensione |
| `src/components/appointments/NewAppointmentDialog.tsx` | Form esteso |
| `src/pages/Appointments.tsx` | Brand info + filtri |

---

## Vantaggi del Sistema Clinical Topics

1. **Scalabilita**: AI e operatori possono proporre qualsiasi termine senza modifiche schema
2. **Deduplicazione**: Normalizzazione unicode-safe + alias garantiscono match affidabile
3. **Sicurezza**: Nuovi topic sempre moderabili (needs_review=true)
4. **Review Workflow**: Admin approva/merge/disattiva topic proposti
5. **Analytics**: Filtri per topic_id (ANY/ALL) consentono KPI avanzati
6. **Audit Trail**: Ogni modifica topics viene loggata con before/after
7. **Concurrency-Safe**: Lock riga previene race condition
8. **Retrocompatibilita**: Tutti i nuovi campi sono opzionali
