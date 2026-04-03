

## Piano: Aggiungere fase pipeline a SiLeads e Google Sheets

### Contesto attuale

- Il payload outbound webhook include gia `deal_snapshot.current_stage_name` quando il contatto ha un deal associato.
- La mappatura SiLeads attuale non mappa questo campo verso nessun campo destinazione.
- Google Sheets non include una colonna per la fase pipeline.

### Modifiche

#### 1. Aggiungere `pipeline_stage_name` al `contact_snapshot` (migrazione SQL)

Modificare la funzione `build_contact_snapshot` per includere il nome della fase pipeline corrente, ricavandolo dal deal associato al contatto. Questo rende il dato disponibile come `contact_snapshot.pipeline_stage_name` per tutte le mappature outbound.

```sql
-- Nel SELECT di build_contact_snapshot, aggiungere:
'pipeline_stage_name', (
  SELECT ps.name
  FROM deals d
  JOIN pipeline_stages ps ON ps.id = d.current_stage_id
  WHERE d.contact_id = c.id AND d.status = 'open'
  ORDER BY d.created_at DESC
  LIMIT 1
)
```

#### 2. Aggiornare anche `ai-generate-webhook-mapping` (edge function)

Aggiornare il prompt in `supabase/functions/ai-generate-webhook-mapping/index.ts` per includere il nuovo campo `contact_snapshot.pipeline_stage_name` nella lista dei campi disponibili.

#### 3. Google Sheets — aggiungere colonna "Fase Pipeline"

In `supabase/functions/sheets-leads-export/index.ts`:

- Aggiungere `"Fase Pipeline"` a `LEADS_HEADERS` (24a colonna).
- In `fetchSingleLeadRow`: fare un join/query per ottenere la fase dal deal del contatto.
- In `fetchAllLeadsRows`: aggiungere una query batch per i deal + stages dei contatti.
- In `buildRow`: aggiungere il valore della fase pipeline come ultima colonna.
- Aggiornare il range da `A:W` (23 colonne) a `A:X` (24 colonne).

#### 4. Nessuna modifica al payload_mapping SiLeads nel DB

Il campo `contact_snapshot.pipeline_stage_name` sara disponibile ma la mappatura SiLeads nel database va aggiornata dall'utente tramite l'interfaccia (o possiamo aggiungerla automaticamente se l'utente indica quale campo SiLeads usare, ad es. uno dei campi `note1`-`note10`).

### File coinvolti

- **Migrazione SQL**: nuova migrazione per `build_contact_snapshot`
- `supabase/functions/ai-generate-webhook-mapping/index.ts`
- `supabase/functions/sheets-leads-export/index.ts`

