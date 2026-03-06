CREATE OR REPLACE FUNCTION public.trg_notify_deal_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name text;
  v_contact_name text;
BEGIN
  IF OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = NEW.current_stage_id;
    SELECT COALESCE(first_name || ' ' || last_name, first_name, email, 'Contatto')
    INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;

    PERFORM create_brand_notifications(
      NEW.brand_id,
      'pipeline_stage_changed',
      'Deal spostato: ' || COALESCE(v_contact_name, 'N/A'),
      'Nuovo stage: ' || COALESCE(v_stage_name, 'N/A'),
      'deal',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Now fix the deal
UPDATE deals SET current_stage_id = '0e978118-c30f-41e3-b199-7782a386d228', updated_at = now() WHERE id = 'dc44a6a9-2dfc-4dd3-9f9b-8cfae55f249f';
