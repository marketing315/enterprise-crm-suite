-- Add RLS policy for deleting contacts (admins and users in brand)
CREATE POLICY "Users can delete contacts in their brands" 
ON public.contacts 
FOR DELETE 
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));