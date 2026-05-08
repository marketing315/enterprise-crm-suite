-- Pulisce misurazioni SLO 'backup-freshness' relative al periodo precedente al primo backup completato.
-- Quelle misure (good_events=0) tengono il current_sli al ~25% e generano falsi alert SEV3 ogni ora.
DELETE FROM public.slo_measurements
WHERE slo_id = (SELECT id FROM public.slo_definitions WHERE service_name = 'backup-freshness')
  AND good_events = 0
  AND measured_at < (
    SELECT min(completed_at) FROM public.backup_runs WHERE status = 'completed'
  );