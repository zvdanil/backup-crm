-- Проверка недавно зарегистрированных пользователей
-- Пользователи из auth.users (последние 5)
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data->>'parent_name' as parent_name,
  raw_user_meta_data->>'child_name' as child_name
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Профили из user_profiles (последние 5)
SELECT 
  id,
  full_name,
  parent_name,
  child_name,
  role,
  is_active,
  created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 5;

-- Проверка функции get_user_profiles_with_email
SELECT * FROM public.get_user_profiles_with_email()
ORDER BY created_at DESC
LIMIT 5;
