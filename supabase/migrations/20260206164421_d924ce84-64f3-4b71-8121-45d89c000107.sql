-- Fix FK: puntare a public.users invece di auth.users
ALTER TABLE contact_table_views
  DROP CONSTRAINT contact_table_views_owner_user_id_fkey;

ALTER TABLE contact_table_views
  ADD CONSTRAINT contact_table_views_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;