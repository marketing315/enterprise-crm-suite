
-- Enable pg_net extension for HTTP calls from DB
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function that fires on each new lead_event INSERT
CREATE OR REPLACE FUNCTION public.notify_sheets_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _anon_key text;
BEGIN
  _url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/sheets-leads-export';
  _anon_key := current_setting('app.settings.supabase_anon_key', true);

  -- If anon key not available via app settings, use a vault secret or hardcode fallback
  IF _anon_key IS NULL OR _anon_key = '' THEN
    SELECT decrypted_secret INTO _anon_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_anon_key'
    LIMIT 1;
  END IF;

  PERFORM extensions.http_post(
    url := _url,
    body := jsonb_build_object('lead_event_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_anon_key, '')
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger on lead_events INSERT
DROP TRIGGER IF EXISTS trg_sheets_append_lead ON public.lead_events;
CREATE TRIGGER trg_sheets_append_lead
  AFTER INSERT ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sheets_new_lead();
