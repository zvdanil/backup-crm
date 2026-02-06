-- ============================================
-- Проверка ВСЕХ пользователей с метаданными
-- ============================================

SELECT 
  up.id,
  u.email,
  up.full_name as profile_full_name,
  up.parent_name as profile_parent_name,
  up.child_name as profile_child_name,
  up.role,
  up.is_active,
  u.raw_user_meta_data,
  TO_CHAR(up.created_at, 'DD.MM.YYYY HH24:MI') as created
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
ORDER BY up.created_at DESC;
