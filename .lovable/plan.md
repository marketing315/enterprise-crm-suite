
# Piano: Ricerca Contatti Completa su Tutti i Dati

## Obiettivo
Permettere la ricerca di contatti su **tutti i campi disponibili**: nome, cognome, email, telefono, città, CAP, indirizzo, note, tag e custom fields.

## Stato Attuale

### Cosa c'è già
- Tabella `contact_search_index` con `search_text` e `search_vector` (tsvector + trigram)
- Funzione `build_contact_search_text()` che concatena: nome, cognome, email, città, CAP, telefoni, tag, custom fields
- Trigger su `contacts` per aggiornare l'indice

### Problemi identificati

1. **RPC `search_contacts` non usa l'indice** - fa solo ILIKE su pochi campi (first_name, last_name, email, city, phone)
2. **Mancano trigger per tabelle correlate**:
   - `contact_phones` (quando aggiungi/modifichi un telefono)
   - `tag_assignments` (quando aggiungi/rimuovi tag)
   - `contact_field_values` (quando modifichi custom fields)
3. **Campi mancanti nella ricerca**: address, notes

## Modifiche Database

### 1. Aggiornare `build_contact_search_text()` per includere address e notes

```sql
CREATE OR REPLACE FUNCTION public.build_contact_search_text(p_contact_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_text TEXT := '';
  v_contact RECORD;
BEGIN
  SELECT c.first_name, c.last_name, c.email, c.city, c.cap, 
         c.address, c.notes, b.name as brand_name
  INTO v_contact FROM contacts c 
  LEFT JOIN brands b ON b.id = c.brand_id 
  WHERE c.id = p_contact_id;
  
  IF v_contact IS NULL THEN RETURN ''; END IF;
  
  v_text := COALESCE(v_contact.first_name, '') || ' ' || 
            COALESCE(v_contact.last_name, '') || ' ' ||
            COALESCE(v_contact.email, '') || ' ' || 
            COALESCE(v_contact.city, '') || ' ' ||
            COALESCE(v_contact.cap, '') || ' ' || 
            COALESCE(v_contact.address, '') || ' ' ||
            COALESCE(v_contact.notes, '') || ' ' ||
            COALESCE(v_contact.brand_name, '');
  
  -- Telefoni
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(phone_normalized, ' ') 
    FROM contact_phones WHERE contact_id = p_contact_id AND is_active
  ), '');
  
  -- Tag
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(t.name, ' ') 
    FROM tag_assignments ta JOIN tags t ON t.id = ta.tag_id 
    WHERE ta.contact_id = p_contact_id
  ), '');
  
  -- Custom fields
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(value_text, ' ') 
    FROM contact_field_values WHERE contact_id = p_contact_id AND value_text IS NOT NULL
  ), '');
  
  RETURN lower(regexp_replace(trim(v_text), '\s+', ' ', 'g'));
END;
$$;
```

### 2. Aggiungere trigger per tabelle correlate

```sql
-- Trigger per contact_phones
CREATE OR REPLACE FUNCTION public.trigger_phone_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_contact_search_index(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_contact_search_index(NEW.contact_id);
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_phone_search_sync 
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_phones 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_phone_search_sync();

-- Trigger per tag_assignments
CREATE OR REPLACE FUNCTION public.trigger_tag_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.contact_id IS NOT NULL THEN
      PERFORM public.update_contact_search_index(OLD.contact_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.contact_id IS NOT NULL THEN
      PERFORM public.update_contact_search_index(NEW.contact_id);
    END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_tag_search_sync 
  AFTER INSERT OR DELETE ON public.tag_assignments 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_tag_search_sync();

-- Trigger per contact_field_values
CREATE OR REPLACE FUNCTION public.trigger_field_values_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_contact_search_index(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_contact_search_index(NEW.contact_id);
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_field_values_search_sync 
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_field_values 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_field_values_search_sync();
```

### 3. Aggiornare RPC `search_contacts` per usare l'indice

```sql
CREATE OR REPLACE FUNCTION public.search_contacts(
  p_brand_id uuid,
  p_query text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT FALSE,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
  v_tag_count int := COALESCE(array_length(p_tag_ids, 1), 0);
  v_clean_query text;
BEGIN
  -- Autenticazione e validazione (invariato)
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  
  -- Supporto multi-brand: se p_brand_id è NULL, usa tutti i brand dell'utente
  IF p_brand_id IS NOT NULL AND NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;
  
  IF p_query IS NOT NULL AND length(p_query) > 200 THEN
    RAISE EXCEPTION 'Query too long: max 200 characters';
  END IF;
  
  p_limit := LEAST(p_limit, 500);
  p_offset := GREATEST(p_offset, 0);
  v_clean_query := NULLIF(TRIM(p_query), '');

  WITH user_brands AS (
    SELECT ur.brand_id FROM user_roles ur WHERE ur.user_id = v_user_id
  ),
  filtered AS (
    SELECT 
      c.id, c.brand_id, c.first_name, c.last_name, c.email, c.city, c.status,
      c.created_at, c.updated_at,
      (SELECT json_agg(...) FROM contact_phones cp ...) AS phones
    FROM contacts c
    JOIN contact_search_index csi ON csi.contact_id = c.id
    WHERE 
      -- Filtro brand
      (p_brand_id IS NULL AND csi.brand_id IN (SELECT brand_id FROM user_brands))
      OR (p_brand_id IS NOT NULL AND c.brand_id = p_brand_id)
      -- Ricerca full-text usando l'indice
      AND (
        v_clean_query IS NULL
        OR csi.search_text ILIKE '%' || v_clean_query || '%'
        OR csi.search_vector @@ plainto_tsquery('simple', v_clean_query)
      )
      -- Filtro tag (invariato)
      AND (v_tag_count = 0 OR ...)
  )
  -- Resto invariato (paginazione, conteggio, JSON)
  ...
END;
$$;
```

### 4. Rigenerare l'indice per i contatti esistenti

```sql
-- Funzione per rebuild completo
CREATE OR REPLACE FUNCTION public.rebuild_contact_search_index()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  DELETE FROM contact_search_index;
  INSERT INTO contact_search_index (contact_id, brand_id, search_text, search_vector, updated_at)
  SELECT 
    c.id, c.brand_id, 
    public.build_contact_search_text(c.id),
    to_tsvector('simple', public.build_contact_search_text(c.id)),
    now()
  FROM contacts c;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- Esegui rebuild
SELECT public.rebuild_contact_search_index();
```

## File da Modificare

| File | Modifiche |
|------|-----------|
| **Nuova migrazione SQL** | Aggiornare funzioni, trigger e RPC |

## Frontend

Nessuna modifica frontend necessaria: l'hook `useContactSearch` già chiama la RPC che verrà potenziata.

## Risultato Atteso

La ricerca troverà contatti cercando in:
- Nome e cognome
- Email
- Telefono (qualsiasi formato)
- Città e CAP
- Indirizzo
- Note
- Nome tag assegnati
- Valori custom fields

La ricerca sarà anche più veloce grazie all'uso degli indici GIN (trigram + tsvector).
