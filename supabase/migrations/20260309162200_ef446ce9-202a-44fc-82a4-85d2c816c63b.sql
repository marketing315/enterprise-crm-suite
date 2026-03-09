CREATE OR REPLACE FUNCTION public.get_thread_display_titles(p_thread_ids uuid[])
RETURNS TABLE(thread_id uuid, display_title text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id AS thread_id,
    CASE
      WHEN t.title IS NOT NULL AND t.title <> '' THEN t.title
      WHEN t.type = 'executive'::text THEN
        COALESCE(
          (SELECT LEFT(cm.message_text, 60)
           FROM chat_messages cm
           WHERE cm.thread_id = t.id AND cm.sender_type = 'user' AND cm.deleted_at IS NULL
           ORDER BY cm.created_at ASC LIMIT 1),
          'Agente AI Executive'
        )
      WHEN t.type = 'group'::text THEN COALESCE(t.title, 'Gruppo')
      WHEN t.type = 'entity'::text AND t.entity_type = 'deal' THEN
        COALESCE(
          (SELECT c.first_name || ' ' || c.last_name
           FROM deals d JOIN contacts c ON c.id = d.contact_id
           WHERE d.id = t.entity_id),
          'Deal'
        )
      WHEN t.type = 'entity'::text AND t.entity_type = 'ticket' THEN
        COALESCE(
          (SELECT tk.title FROM tickets tk WHERE tk.id = t.entity_id),
          'Ticket'
        )
      WHEN t.type = 'entity'::text AND t.entity_type = 'contact' THEN
        COALESCE(
          (SELECT c.first_name || ' ' || c.last_name FROM contacts c WHERE c.id = t.entity_id),
          'Contatto'
        )
      WHEN t.type = 'entity'::text AND t.entity_type = 'appointment' THEN
        COALESCE(
          (SELECT c.first_name || ' ' || c.last_name
           FROM appointments a JOIN contacts c ON c.id = a.contact_id
           WHERE a.id = t.entity_id),
          'Appuntamento'
        )
      ELSE
        COALESCE(
          (SELECT LEFT(cm.message_text, 60)
           FROM chat_messages cm
           WHERE cm.thread_id = t.id AND cm.sender_type = 'user' AND cm.deleted_at IS NULL
           ORDER BY cm.created_at ASC LIMIT 1),
          'Conversazione'
        )
    END AS display_title
  FROM chat_threads t
  WHERE t.id = ANY(p_thread_ids);
END;
$$;