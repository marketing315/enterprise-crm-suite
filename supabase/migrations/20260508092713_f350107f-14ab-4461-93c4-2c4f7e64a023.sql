DELETE FROM public.slo_measurements
WHERE slo_id = (SELECT id FROM public.slo_definitions WHERE service_name = 'backup-freshness')
  AND good_events = 0
  AND measured_at < now() - interval '6 hours';