-- Add HMAC signature verification columns to webhook_sources
-- Enables per-source HMAC validation with anti-replay protection

ALTER TABLE public.webhook_sources
ADD COLUMN IF NOT EXISTS hmac_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hmac_secret_hash text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS replay_window_seconds integer NOT NULL DEFAULT 300;

-- Add check constraint for replay window (1 minute to 1 hour)
ALTER TABLE public.webhook_sources
ADD CONSTRAINT webhook_sources_replay_window_check 
CHECK (replay_window_seconds >= 60 AND replay_window_seconds <= 3600);

-- Add comment for documentation
COMMENT ON COLUMN public.webhook_sources.hmac_enabled IS 'Enable HMAC-SHA256 signature verification via X-Signature header';
COMMENT ON COLUMN public.webhook_sources.hmac_secret_hash IS 'SHA-256 hash of the HMAC signing secret';
COMMENT ON COLUMN public.webhook_sources.replay_window_seconds IS 'Time window in seconds for anti-replay validation (default 300s = 5min)';