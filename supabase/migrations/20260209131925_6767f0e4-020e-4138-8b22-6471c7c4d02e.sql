-- Enable realtime for contacts and contact_phones tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_phones;