-- Create function to get user profiles with email from auth.users
-- (Must run after 20260214000000_add_parent_child_name_to_user_profiles.sql so parent_name/child_name exist)
CREATE OR REPLACE FUNCTION public.get_user_profiles_with_email()
RETURNS TABLE (
  id uuid,
  full_name text,
  parent_name text,
  child_name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  email text
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT 
    up.id,
    up.full_name,
    up.parent_name,
    up.child_name,
    up.role,
    up.is_active,
    up.created_at,
    up.updated_at,
    au.email
  FROM public.user_profiles up
  LEFT JOIN auth.users au ON au.id = up.id
  ORDER BY up.created_at DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_profiles_with_email() TO authenticated;

COMMENT ON FUNCTION public.get_user_profiles_with_email() IS 'Returns user profiles with email from auth.users table';
