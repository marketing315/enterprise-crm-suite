-- Enable realtime for ticket_audit_logs table (for SLA breach notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_audit_logs;