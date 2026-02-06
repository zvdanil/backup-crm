-- ============================================
-- Найти пользователей БЕЗ профиля (orphaned users)
-- ============================================

-- Пользователи из auth.users, у которых НЕТ профиля в user_profiles
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data,
  u.created_at,
  'NO PROFILE' as status
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE up.id IS NULL
ORDER BY u.created_at DESC;

-- ============================================
-- Создать профиль для пользователя zvdashadan@gmail.com
-- ============================================

-- Сначала проверим, есть ли этот пользователь в auth.users
SELECT 
  id,
  email,
  raw_user_meta_data,
  created_at
FROM auth.users
WHERE email = 'zvdashadan@gmail.com';

-- ============================================
-- ИСПРАВЛЕНИЕ: Создать профиль для zv.dashadan@gmail.com
-- ============================================

-- Создаем профиль с данными из raw_user_meta_data
INSERT INTO user_profiles (id, full_name, parent_name, child_name, role, is_active)
SELECT 
  u.id,
  TRIM(u.raw_user_meta_data->>'full_name') as full_name,
  TRIM(u.raw_user_meta_data->>'parent_name') as parent_name,
  TRIM(u.raw_user_meta_data->>'child_name') as child_name,
  'newregistration' as role,
  false as is_active
FROM auth.users u
WHERE u.email = 'zv.dashadan@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = u.id);

-- ============================================
-- Проверка результата
-- ============================================

-- Проверяем созданный профиль
SELECT 
  up.id,
  u.email,
  up.full_name,
  up.parent_name,
  up.child_name,
  up.role,
  up.is_active,
  TO_CHAR(up.created_at, 'DD.MM.YYYY HH24:MI') as created
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE u.email = 'zv.dashadan@gmail.com';

-- Проверяем что больше нет orphaned users
SELECT COUNT(*) as orphaned_count
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE up.id IS NULL;
