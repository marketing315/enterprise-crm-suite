-- Add realtime polling toggle to voispeed_configs (additive, default off)
ALTER TABLE public.voispeed_configs
  ADD COLUMN IF NOT EXISTS enable_realtime_poll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS poll_agents_service text NOT NULL DEFAULT 'agents_status',
  ADD COLUMN IF NOT EXISTS poll_queues_service text NOT NULL DEFAULT 'queues_stats',
  ADD COLUMN IF NOT EXISTS last_poll_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_poll_error text;

CREATE INDEX IF NOT EXISTS ix_voispeed_configs_realtime_poll
  ON public.voispeed_configs (enable_realtime_poll) WHERE enable_realtime_poll = true;