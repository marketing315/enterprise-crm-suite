-- Add SLA thresholds configuration to brands table
-- JSONB column with default values for priority 1-5 (in minutes)
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS sla_thresholds_minutes JSONB NOT NULL DEFAULT '{"1": 60, "2": 120, "3": 240, "4": 480, "5": 1440}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.brands.sla_thresholds_minutes IS 'SLA thresholds in minutes per priority level (1-5). P1=60min, P2=120min, P3=240min, P4=480min, P5=1440min by default.';