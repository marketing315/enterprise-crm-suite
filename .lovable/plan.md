

# Conteggio Lead Configurabile per Inbound Source

## Problema attuale

Le RPC `count_new_leads_in_range` e `count_new_leads_by_day` contano come "nuovo lead" ogni contatto il cui primo evento cade nel range. Ma alcuni webhook (es. "Keplero - Appuntamento fissato (Update)") non rappresentano nuovi lead — sono aggiornamenti/appuntamenti e devono essere esclusi dal conteggio lead.

## Soluzione

Aggiungere un flag `counts_as_new_lead` (boolean, default `true`) alla tabella `webhook_sources`. I webhook con questo flag a `false` verranno esclusi dal conteggio nuovi lead nelle RPC. L'admin può configurare questa opzione dal pannello Inbound Sources.

## Modifiche

### 1. Migration SQL — Nuova colonna + Aggiornamento RPC

**Colonna**: `ALTER TABLE webhook_sources ADD COLUMN counts_as_new_lead boolean NOT NULL DEFAULT true;`

**Aggiornamento view**: `webhook_sources_safe` deve esporre il nuovo campo.

**Aggiornamento RPC `count_new_leads_in_range`**: Filtrare i lead_events la cui `source_name` corrisponde a un webhook_source con `counts_as_new_lead = false`. Il join avviene su `lead_events.source_name = webhook_sources.name AND lead_events.brand_id = webhook_sources.brand_id`.

**Aggiornamento RPC `count_new_leads_by_day`**: Stesso filtro.

**Impostare il flag a `false`** per il webhook "Keplero - Appuntamento fissato (Update)" già esistente.

**Logica dedup same-day**: Tutti i lead dello stesso contatto nello stesso giorno contano come 1 (questo è già gestito dal `DISTINCT contact_id`).

### 2. Frontend — Form Inbound Source

**InboundSourceFormDrawer.tsx**: Aggiungere un campo Switch "Conta come nuovo lead" nel form, mappato su `counts_as_new_lead`. Default: attivo.

**InboundSourceList.tsx**: Mostrare un badge "Non conta come lead" accanto ai source con `counts_as_new_lead = false`.

**useInboundSources.ts**: Aggiungere `counts_as_new_lead` all'interfaccia `InboundSource` e alla query select.

### 3. Nessuna modifica ai hook dashboard

Le RPC gestiscono tutto lato DB — `useDashboardData.ts` e `usePrefetchOnLogin.ts` non cambiano.

## Dettaglio tecnico RPC

```sql
-- count_new_leads_in_range: esclude source_name di webhook con counts_as_new_lead = false
SELECT count(DISTINCT le.contact_id)
FROM lead_events le
WHERE le.brand_id = ANY(p_brand_ids)
  AND le.contact_id IS NOT NULL
  AND le.received_at >= p_from
  AND le.received_at <= p_to
  -- Escludi webhook marcati come "non conta come lead"
  AND NOT EXISTS (
    SELECT 1 FROM webhook_sources ws
    WHERE ws.name = le.source_name
      AND ws.brand_id = le.brand_id
      AND ws.counts_as_new_lead = false
  )
  -- Escludi contatti già visti prima del range (solo da source che contano)
  AND NOT EXISTS (
    SELECT 1 FROM lead_events older
    WHERE older.contact_id = le.contact_id
      AND older.brand_id = le.brand_id
      AND older.received_at < p_from
      AND NOT EXISTS (
        SELECT 1 FROM webhook_sources ws2
        WHERE ws2.name = older.source_name
          AND ws2.brand_id = older.brand_id
          AND ws2.counts_as_new_lead = false
      )
  );
```

## File coinvolti

| File | Modifica |
|------|----------|
| Migration SQL | Nuova colonna + view + 2 RPC aggiornate + UPDATE dato esistente |
| `src/hooks/useInboundSources.ts` | Aggiungere `counts_as_new_lead` a interfaccia e select |
| `src/components/settings/inbound/InboundSourceFormDrawer.tsx` | Switch nel form |
| `src/components/settings/inbound/InboundSourceList.tsx` | Badge visivo |

