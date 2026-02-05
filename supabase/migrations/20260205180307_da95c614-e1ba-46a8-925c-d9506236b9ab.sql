-- Create a function that maps pipeline stage to contact status intelligently
-- It uses semantic matching based on stage names
CREATE OR REPLACE FUNCTION public.map_stage_to_contact_status(p_stage_name TEXT)
RETURNS contact_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_stage_lower TEXT;
BEGIN
  v_stage_lower := lower(p_stage_name);
  
  -- Semantic matching based on common patterns
  -- "Nuovo" stages -> new
  IF v_stage_lower LIKE '%nuovo%' OR v_stage_lower LIKE '%new%' OR v_stage_lower LIKE '%lead%' THEN
    RETURN 'new'::contact_status;
  END IF;
  
  -- "In Lavorazione", "Contattato", "Working" stages -> active
  IF v_stage_lower LIKE '%lavorazione%' OR v_stage_lower LIKE '%contatt%' OR 
     v_stage_lower LIKE '%working%' OR v_stage_lower LIKE '%progress%' OR
     v_stage_lower LIKE '%trattativa%' OR v_stage_lower LIKE '%negoziazione%' THEN
    RETURN 'active'::contact_status;
  END IF;
  
  -- "Qualificato", "Qualified", "Hot" stages -> qualified  
  IF v_stage_lower LIKE '%qualificat%' OR v_stage_lower LIKE '%qualified%' OR 
     v_stage_lower LIKE '%hot%' OR v_stage_lower LIKE '%pronto%' OR
     v_stage_lower LIKE '%chiusura%' OR v_stage_lower LIKE '%closing%' THEN
    RETURN 'qualified'::contact_status;
  END IF;
  
  -- "KO", "Perso", "Lost", "Non interessato" stages -> unqualified
  IF v_stage_lower LIKE '%ko%' OR v_stage_lower LIKE '%perso%' OR 
     v_stage_lower LIKE '%lost%' OR v_stage_lower LIKE '%non interessat%' OR
     v_stage_lower LIKE '%rifiut%' OR v_stage_lower LIKE '%rejected%' THEN
    RETURN 'unqualified'::contact_status;
  END IF;
  
  -- "Archiviato", "Chiuso", "Archived" stages -> archived (but only for closed deals)
  IF v_stage_lower LIKE '%archiviat%' OR v_stage_lower LIKE '%archived%' THEN
    RETURN 'archived'::contact_status;
  END IF;
  
  -- Default: keep as active if already in pipeline
  RETURN 'active'::contact_status;
END;
$$;

-- Create trigger function that updates contact status when deal stage changes
CREATE OR REPLACE FUNCTION public.sync_contact_status_on_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name TEXT;
  v_new_status contact_status;
  v_deal_status TEXT;
BEGIN
  -- Only process if current_stage_id actually changed
  IF OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    -- Get the new stage name
    SELECT name INTO v_stage_name
    FROM pipeline_stages
    WHERE id = NEW.current_stage_id;
    
    IF v_stage_name IS NOT NULL THEN
      -- Also consider deal status (won/lost/closed override stage-based logic)
      v_deal_status := NEW.status;
      
      IF v_deal_status = 'won' THEN
        -- Won deals -> contact becomes qualified (successful conversion)
        v_new_status := 'qualified'::contact_status;
      ELSIF v_deal_status IN ('lost', 'closed') THEN
        -- Lost/closed deals -> contact becomes unqualified or archived
        v_new_status := 'unqualified'::contact_status;
      ELSE
        -- Active deals -> use stage-based mapping
        v_new_status := map_stage_to_contact_status(v_stage_name);
      END IF;
      
      -- Update the contact status
      UPDATE contacts
      SET status = v_new_status,
          updated_at = now()
      WHERE id = NEW.contact_id
        AND status IS DISTINCT FROM v_new_status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on deals table
DROP TRIGGER IF EXISTS trg_sync_contact_status_on_deal_stage ON deals;
CREATE TRIGGER trg_sync_contact_status_on_deal_stage
  AFTER UPDATE OF current_stage_id, status ON deals
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_status_on_deal_stage_change();

-- Also handle when deal is first created with a stage
CREATE OR REPLACE FUNCTION public.sync_contact_status_on_deal_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name TEXT;
  v_new_status contact_status;
BEGIN
  IF NEW.current_stage_id IS NOT NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT name INTO v_stage_name
    FROM pipeline_stages
    WHERE id = NEW.current_stage_id;
    
    IF v_stage_name IS NOT NULL THEN
      v_new_status := map_stage_to_contact_status(v_stage_name);
      
      UPDATE contacts
      SET status = v_new_status,
          updated_at = now()
      WHERE id = NEW.contact_id
        AND status IS DISTINCT FROM v_new_status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contact_status_on_deal_create ON deals;
CREATE TRIGGER trg_sync_contact_status_on_deal_create
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_status_on_deal_create();