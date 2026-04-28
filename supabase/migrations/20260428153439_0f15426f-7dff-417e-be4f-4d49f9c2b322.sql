CREATE TABLE public.siem_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  hmac_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  entity_types_filter TEXT[] DEFAULT NULL,
  actions_filter TEXT[] DEFAULT NULL,
  mask_pii BOOLEAN NOT NULL DEFAULT true,
  batch_size INTEGER NOT NULL DEFAULT 100 CHECK (batch_size BETWEEN 1 AND 500),
  last_exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_siem_destinations_brand ON public.siem_destinations (brand_id) WHERE is_active = true;
CREATE INDEX idx_siem_destinations_active ON public.siem_destinations (is_active, last_exported_at) WHERE is_active = true;

CREATE TABLE public.siem_export_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES public.siem_destinations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL,
  events_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  http_status INTEGER,
  error_message TEXT,
  latency_ms INTEGER,
  exported_from TIMESTAMPTZ,
  exported_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_siem_export_log_dest ON public.siem_export_log (destination_id, created_at DESC);
CREATE INDEX idx_siem_export_log_brand ON public.siem_export_log (brand_id, created_at DESC);

CREATE TRIGGER update_siem_destinations_updated_at
  BEFORE UPDATE ON public.siem_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.siem_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view SIEM destinations"
ON public.siem_destinations FOR SELECT
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Admins can manage SIEM destinations"
ON public.siem_destinations FOR ALL
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Admins can view SIEM export log"
ON public.siem_export_log FOR SELECT
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Service can insert SIEM export log"
ON public.siem_export_log FOR INSERT
TO service_role
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_pending_siem_exports(_destination_id UUID)
RETURNS TABLE (
  event_id UUID,
  brand_id UUID,
  entity_type TEXT,
  entity_id UUID,
  action TEXT,
  actor_user_id UUID,
  actor_type TEXT,
  actor_display_name TEXT,
  source TEXT,
  old_value JSONB,
  new_value JSONB,
  changed_fields TEXT[],
  metadata JSONB,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dest public.siem_destinations%ROWTYPE;
BEGIN
  SELECT * INTO _dest FROM public.siem_destinations
  WHERE id = _destination_id AND is_active = true
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ae.id,
    ae.brand_id,
    ae.entity_type,
    ae.entity_id,
    ae.action,
    ae.actor_user_id,
    ae.actor_type,
    ae.actor_display_name,
    ae.source,
    ae.old_value,
    ae.new_value,
    ae.changed_fields,
    ae.metadata,
    ae.correlation_id,
    ae.occurred_at
  FROM public.audit_events ae
  WHERE ae.brand_id = _dest.brand_id
    AND ae.occurred_at > _dest.last_exported_at
    AND (_dest.entity_types_filter IS NULL OR ae.entity_type = ANY(_dest.entity_types_filter))
    AND (_dest.actions_filter IS NULL OR ae.action = ANY(_dest.actions_filter))
  ORDER BY ae.occurred_at ASC
  LIMIT _dest.batch_size;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_siem_export_result(
  _destination_id UUID,
  _success BOOLEAN,
  _last_event_at TIMESTAMPTZ,
  _events_count INTEGER,
  _http_status INTEGER DEFAULT NULL,
  _error_message TEXT DEFAULT NULL,
  _latency_ms INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _brand_id UUID;
  _from_cursor TIMESTAMPTZ;
BEGIN
  SELECT brand_id, last_exported_at INTO _brand_id, _from_cursor
  FROM public.siem_destinations
  WHERE id = _destination_id;

  IF _success THEN
    UPDATE public.siem_destinations
    SET last_exported_at = COALESCE(_last_event_at, last_exported_at),
        last_success_at = now(),
        last_error = NULL,
        consecutive_failures = 0,
        updated_at = now()
    WHERE id = _destination_id;
  ELSE
    UPDATE public.siem_destinations
    SET last_error = _error_message,
        consecutive_failures = consecutive_failures + 1,
        updated_at = now()
    WHERE id = _destination_id;
  END IF;

  INSERT INTO public.siem_export_log (
    destination_id, brand_id, events_count, status, http_status,
    error_message, latency_ms, exported_from, exported_to
  ) VALUES (
    _destination_id, _brand_id, _events_count,
    CASE WHEN _success THEN 'success' ELSE 'failed' END,
    _http_status, _error_message, _latency_ms,
    _from_cursor, _last_event_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pending_siem_exports(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_siem_export_result(UUID, BOOLEAN, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, INTEGER) TO service_role;