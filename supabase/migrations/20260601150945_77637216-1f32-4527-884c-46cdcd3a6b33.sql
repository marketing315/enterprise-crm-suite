-- Cron job: pulizia challenge passkey scadute ogni 30 minuti.
-- La funzione cleanup_passkey_auth_challenges() elimina solo righe più vecchie di 1 ora.
DO $$
BEGIN
  -- Se già esiste con questo nome, unschedule per idempotenza
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'passkey-challenges-cleanup') THEN
    PERFORM cron.unschedule('passkey-challenges-cleanup');
  END IF;
END $$;

SELECT cron.schedule(
  'passkey-challenges-cleanup',
  '*/30 * * * *',
  $$ SELECT public.cleanup_passkey_auth_challenges(); $$
);