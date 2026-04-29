-- Add trace_id (W3C trace-id, 32 hex chars) to MCP request log to correlate
-- audit entries with OpenTelemetry spans in trace_events.
ALTER TABLE public.mcp_request_log
  ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS idx_mcp_req_log_trace
  ON public.mcp_request_log (trace_id)
  WHERE trace_id IS NOT NULL;