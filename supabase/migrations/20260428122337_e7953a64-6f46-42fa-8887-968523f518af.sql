-- Tabella anomalie persistite
CREATE TABLE public.audit_anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  actor_user_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_anomalies_brand_detected 
  ON public.audit_anomalies(brand_id, detected_at DESC);
CREATE INDEX idx_audit_anomalies_severity 
  ON public.audit_anomalies(severity, detected_at DESC);

ALTER TABLE public.audit_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view anomalies"
  ON public.audit_anomalies FOR SELECT
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Service can insert anomalies"
  ON public.audit_anomalies FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update anomalies (ack)"
  ON public.audit_anomalies FOR UPDATE
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

-- Canali alert
CREATE TABLE public.audit_alert_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('webhook', 'email')),
  destination TEXT NOT NULL,
  webhook_secret TEXT,
  min_severity TEXT NOT NULL DEFAULT 'high' CHECK (min_severity IN ('low', 'medium', 'high', 'critical')),
  anomaly_types TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  mask_pii BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_alert_channels_brand_active 
  ON public.audit_alert_channels(brand_id, is_active);

ALTER TABLE public.audit_alert_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alert channels"
  ON public.audit_alert_channels FOR SELECT
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Admins can manage alert channels"
  ON public.audit_alert_channels FOR ALL
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

-- Log consegne
CREATE TABLE public.audit_alert_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.audit_alert_channels(id) ON DELETE CASCADE,
  anomaly_id UUID REFERENCES public.audit_anomalies(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  error_message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_alert_deliveries_status 
  ON public.audit_alert_deliveries(status, created_at DESC);
CREATE INDEX idx_audit_alert_deliveries_brand 
  ON public.audit_alert_deliveries(brand_id, created_at DESC);

ALTER TABLE public.audit_alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alert deliveries"
  ON public.audit_alert_deliveries FOR SELECT
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Service can insert deliveries"
  ON public.audit_alert_deliveries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update deliveries"
  ON public.audit_alert_deliveries FOR UPDATE
  USING (true);

CREATE TRIGGER trg_audit_alert_channels_updated_at
  BEFORE UPDATE ON public.audit_alert_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_alert_deliveries_updated_at
  BEFORE UPDATE ON public.audit_alert_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper severità
CREATE OR REPLACE FUNCTION public.severity_meets_threshold(_severity TEXT, _threshold TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _severity
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0
  END >= CASE _threshold
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0
  END;
$$;

-- Trigger fan-out delivery
CREATE OR REPLACE FUNCTION public.enqueue_audit_alert_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _channel RECORD;
BEGIN
  FOR _channel IN
    SELECT id, brand_id, anomaly_types
    FROM public.audit_alert_channels
    WHERE is_active = true
      AND (brand_id = NEW.brand_id OR brand_id = '00000000-0000-0000-0000-000000000000'::uuid)
      AND public.severity_meets_threshold(NEW.severity, min_severity)
      AND (cardinality(anomaly_types) = 0 OR NEW.anomaly_type = ANY(anomaly_types))
  LOOP
    INSERT INTO public.audit_alert_deliveries (channel_id, anomaly_id, brand_id, status)
    VALUES (_channel.id, NEW.id, NEW.brand_id, 'pending');
  END LOOP;

  PERFORM pg_notify('audit_alert_dispatch', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_anomalies_alert
  AFTER INSERT ON public.audit_anomalies
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_audit_alert_deliveries();

-- RPC insert anomalia (utilizzabile da edge / scheduler)
CREATE OR REPLACE FUNCTION public.record_audit_anomaly(
  _brand_id UUID,
  _anomaly_type TEXT,
  _severity TEXT,
  _title TEXT,
  _description TEXT DEFAULT NULL,
  _actor_user_id UUID DEFAULT NULL,
  _details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  INSERT INTO public.audit_anomalies (
    brand_id, anomaly_type, severity, title, description, actor_user_id, details
  ) VALUES (
    COALESCE(_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    _anomaly_type, _severity, _title, _description, _actor_user_id, COALESCE(_details, '{}'::jsonb)
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- RPC dispatcher (claim concurrente)
CREATE OR REPLACE FUNCTION public.get_pending_alert_deliveries(_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  delivery_id UUID,
  channel_id UUID,
  anomaly_id UUID,
  brand_id UUID,
  channel_type TEXT,
  destination TEXT,
  webhook_secret TEXT,
  mask_pii BOOLEAN,
  attempt_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id, d.channel_id, d.anomaly_id, d.brand_id,
    c.channel_type, c.destination, c.webhook_secret, c.mask_pii,
    d.attempt_count
  FROM public.audit_alert_deliveries d
  JOIN public.audit_alert_channels c ON c.id = d.channel_id
  WHERE d.status IN ('pending', 'retrying')
    AND d.attempt_count < 5
    AND c.is_active = true
  ORDER BY d.created_at ASC
  LIMIT LEAST(_limit, 200)
  FOR UPDATE SKIP LOCKED;
$$;