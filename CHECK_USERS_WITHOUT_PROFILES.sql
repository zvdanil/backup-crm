-- Проверка: есть ли пользователи в auth.users без профилей в user_profiles

-- 1. Пользователи в auth.users без подтверждённого email
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at,
  up.id as profile_exists
FROM auth.users u
LEFT JOIN public.user_profiles up ON u.id = up.id
WHERE u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;

-- 2. Пользователи в auth.users с подтверждённым email
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at,
  up.id as profile_exists,
  up.role,
  up.is_active
FROM auth.users u
LEFT JOIN public.user_profiles up ON u.id = up.id
WHERE u.email_confirmed_at IS NOT NULL
ORDER BY u.created_at DESC
LIMIT 10;

-- 3. Если есть пользователи без профилей - создать для них профили
-- Раскомментируйте и выполните если нужно:
/*
INSERT INTO public.user_profiles (id, full_name, parent_name, child_name, role, is_active)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'parent_name'),
  u.raw_user_meta_data->>'parent_name',
  u.raw_user_meta_data->>'child_name',
  'newregistration'::user_role,
  false
FROM auth.users u
LEFT JOIN public.user_profiles up ON u.id = up.id
WHERE up.id IS NULL
  AND u.email_confirmed_at IS NOT NULL;
*/
