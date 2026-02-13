-- Policy DELETE per tickets
CREATE POLICY "Users can delete tickets in their brands"
ON public.tickets
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Policy DELETE per ticket_events
CREATE POLICY "Users can delete ticket events in their brands"
ON public.ticket_events
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Policy DELETE per ticket_audit_logs
CREATE POLICY "Users can delete audit logs in their brands"
ON public.ticket_audit_logs
FOR DELETE
TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));