
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

  SELECT decrypted_secret INTO _anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_anon_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := _url,
    body := jsonb_build_object('lead_event_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_anon_key, ''),
      'apikey', COALESCE(_anon_key, '')
    )
  );

  RETURN NEW;
END;
$$;
