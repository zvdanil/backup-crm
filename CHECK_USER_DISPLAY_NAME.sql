-- Проверка: почему имя не отображается в UI?
-- Для пользователя 704f0301-a901-49cd-9b92-4edabe370037 (zvira@ukr.net)

SELECT 
  up.id,
  u.email,
  up.full_name,
  up.parent_name,
  up.child_name,
  up.role,
  up.is_active,
  u.raw_user_meta_data,
  u.raw_app_meta_data
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE u.email = 'zvira@ukr.net';
