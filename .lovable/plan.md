
# Piano: AI Autotagging Pipeline + Gestione Fasi Kanban Avanzata

## Panoramica

Questo piano implementa due funzionalità correlate:
1. **AI Autotagging per Deal**: Suggerimento e applicazione automatica di tag sui deal basandosi su contesto (contatto, lead events, stage)
2. **Gestione Fasi Pipeline Completa**: Miglioramento dell'editing inline per includere modifica colore

---

## Parte 1: AI Autotagging per Deal

### Obiettivo

Quando un deal viene creato o cambia stato/stage, l'AI analizza il contesto e suggerisce tag appropriati. L'utente può accettare, rifiutare o modificare i suggerimenti.

### Architettura

```text
Deal Created/Updated
         |
         v
+--------------------+
|  trigger_deal_tag  |  (Database Trigger)
+--------+-----------+
         |
         v
+--------------------+
|   ai_tag_deals     |  (pg_cron ogni 2 min)
+--------+-----------+
         |
         v
+--------------------+         +----------------------+
|  ai-tag-deals      |  <-->   |  Lovable AI Gateway  |
|  Edge Function     |         |  (Gemini 3 Flash)    |
+--------+-----------+         +----------------------+
         |
         v
+--------------------+
|  tag_assignments   |  (con assigned_by='ai', confidence)
+--------------------+
```

### Database Changes

**1. Nuova tabella coda AI per tag deal**

```sql
CREATE TABLE public.ai_tag_deal_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id),
  deal_id UUID NOT NULL REFERENCES deals(id),
  trigger_reason TEXT NOT NULL, -- 'deal_created', 'stage_changed', 'manual'
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_tag_deal_jobs_pending ON ai_tag_deal_jobs(status, created_at) 
  WHERE status = 'pending';
```

**2. Trigger per creare job di tagging**

```sql
CREATE OR REPLACE FUNCTION trigger_ai_tag_deal()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo se AI mode non è 'off'
  IF EXISTS (
    SELECT 1 FROM ai_configs 
    WHERE brand_id = NEW.brand_id 
    AND mode != 'off'
  ) THEN
    INSERT INTO ai_tag_deal_jobs (brand_id, deal_id, trigger_reason)
    VALUES (
      NEW.brand_id, 
      NEW.id, 
      CASE 
        WHEN TG_OP = 'INSERT' THEN 'deal_created'
        WHEN OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN 'stage_changed'
        ELSE 'manual'
      END
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_tag_deal
  AFTER INSERT OR UPDATE OF current_stage_id ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ai_tag_deal();
```

**3. RPC per applicare tag suggeriti**

```sql
CREATE OR REPLACE FUNCTION apply_ai_deal_tags(
  p_deal_id UUID,
  p_tag_ids UUID[],
  p_confidence FLOAT DEFAULT 0.8
)
RETURNS INTEGER AS $$
DECLARE
  v_brand_id UUID;
  v_count INTEGER := 0;
BEGIN
  SELECT brand_id INTO v_brand_id FROM deals WHERE id = p_deal_id;
  
  FOREACH tag_id IN ARRAY p_tag_ids LOOP
    INSERT INTO tag_assignments (brand_id, tag_id, deal_id, assigned_by, confidence)
    VALUES (v_brand_id, tag_id, p_deal_id, 'ai', p_confidence)
    ON CONFLICT (tag_id, deal_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Edge Function `ai-tag-deals`

```typescript
// supabase/functions/ai-tag-deals/index.ts

const SYSTEM_PROMPT = `Sei un assistente AI per tagging automatico di deal CRM.
Analizza il contesto del deal (contatto, lead events, stage attuale) e suggerisci tag appropriati.

REGOLE:
1. Suggerisci 1-5 tag pertinenti
2. Usa tag esistenti nel brand (forniti nel contesto)
3. Prioritizza tag specifici rispetto a generici
4. Considera: interesse prodotto, fonte lead, comportamento cliente, fase pipeline

OUTPUT: Array di nomi tag esatti da applicare`;

// Tool per output strutturato
const TAG_SUGGESTION_TOOL = {
  name: "suggest_deal_tags",
  parameters: {
    type: "object",
    properties: {
      tags_to_apply: {
        type: "array",
        items: { type: "string" },
        description: "Nomi esatti dei tag da applicare"
      },
      rationale: {
        type: "string",
        description: "Motivazione breve"
      }
    },
    required: ["tags_to_apply", "rationale"]
  }
};
```

### Frontend: Indicatore Tag AI

Nel `KanbanCard` e `DealDetailSheet`, mostrare badge speciale per tag applicati da AI:

```tsx
// In EntityTagList - badge con icona sparkle per tag AI
{assignment.assigned_by === 'ai' && (
  <Sparkles className="h-3 w-3 text-primary" />
)}
```

---

## Parte 2: Gestione Fasi Pipeline Avanzata

### Miglioramenti UI

**1. Editing colore inline nel SortableStageItem**

Aggiungere popover per selezione colore quando si edita una fase:

```tsx
// In SortableStageItem.tsx
{isEditing && (
  <Popover>
    <PopoverTrigger asChild>
      <button 
        className="w-6 h-6 rounded-full border-2"
        style={{ backgroundColor: editColor }}
      />
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2">
      <div className="grid grid-cols-5 gap-1">
        {STAGE_COLORS.map((c) => (
          <button
            key={c.value}
            className={cn("w-6 h-6 rounded-full", editColor === c.value && "ring-2")}
            style={{ backgroundColor: c.value }}
            onClick={() => setEditColor(c.value)}
          />
        ))}
      </div>
    </PopoverContent>
  </Popover>
)}
```

**2. Salvataggio colore nella mutazione**

```tsx
const handleSave = async () => {
  if (editName.trim() !== stage.name || editColor !== stage.color) {
    await updateStage.mutateAsync({ 
      stageId: stage.id, 
      name: editName,
      color: editColor,
    });
  }
  setIsEditing(false);
};
```

---

## File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/functions/ai-tag-deals/index.ts` | Edge function per suggerimento tag AI |
| `src/hooks/useAIDealTags.ts` | Hook per gestione tag AI sui deal |

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/components/settings/pipeline/SortableStageItem.tsx` | Editing colore inline |
| `src/components/tags/EntityTagList.tsx` | Badge sparkle per tag AI |
| `src/components/tags/TagBadge.tsx` | Prop per indicare origine AI |
| `supabase/config.toml` | Registrare nuova edge function |
| Nuova migrazione SQL | Tabella jobs, trigger, RPC |

---

## Flusso Utente

### AI Autotagging

1. Utente crea un deal o lo sposta di stage
2. Trigger DB crea job nella coda
3. Cron job (ogni 2 min) processa la coda
4. Edge function analizza contesto e suggerisce tag
5. Se AI mode = `auto_apply`: tag applicati automaticamente con badge "AI"
6. Se AI mode = `suggest`: notifica con suggerimenti (futura implementazione)
7. Utente puo rimuovere tag AI come qualsiasi altro tag

### Gestione Fasi

1. Admin va in Impostazioni > Pipeline
2. Click su icona matita di una fase
3. Modifica nome e/o click sul pallino colore
4. Seleziona nuovo colore dal popover
5. Click su check per salvare

---

## Configurazione AI Mode

Riutilizza la configurazione esistente in `ai_configs`:

| Mode | Comportamento Tagging Deal |
|------|---------------------------|
| `off` | Nessun autotagging |
| `suggest` | Crea notifica con suggerimenti (fase 2) |
| `auto_apply` | Applica tag automaticamente |

---

## Risultato Atteso

1. Deal ricevono tag automatici basati su contesto (contatto, lead, stage)
2. Tag AI identificabili visivamente (icona sparkle)
3. Admin possono modificare colore fasi pipeline con un click
4. Sistema configurabile per brand tramite AI mode esistente
5. Audit trail completo tramite `assigned_by='ai'` e `confidence`
