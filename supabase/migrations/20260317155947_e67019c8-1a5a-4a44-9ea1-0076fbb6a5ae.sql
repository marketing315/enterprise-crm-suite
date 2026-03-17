-- Allow admins to view all users (needed for user management joins)
CREATE POLICY "Admins can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (
  public.has_role(public.current_app_user_id(), 'admin'::app_role)
);