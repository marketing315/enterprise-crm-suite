ALTER TABLE public.brand_call_consent_config
  ADD COLUMN IF NOT EXISTS ivr_dtmf_consent_given text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS ivr_dtmf_consent_denied text NOT NULL DEFAULT '2',
  ADD COLUMN IF NOT EXISTS ivr_consent_node_id text;

COMMENT ON COLUMN public.brand_call_consent_config.ivr_dtmf_consent_given IS
  'Tasto DTMF inviato dal chiamante per concedere il consenso alla registrazione (es. "1").';
COMMENT ON COLUMN public.brand_call_consent_config.ivr_dtmf_consent_denied IS
  'Tasto DTMF inviato dal chiamante per negare il consenso alla registrazione (es. "2").';
COMMENT ON COLUMN public.brand_call_consent_config.ivr_consent_node_id IS
  'voispeed_ivr_id del nodo IVR che cattura il consenso (per filtrare gli eventi DTMF irrilevanti).';