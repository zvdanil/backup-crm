-- ============================================
-- Быстрое исправление пользователя 704f0301-a901-49cd-9b92-4edabe370037
-- ============================================

-- 1. Проверяем текущее состояние пользователя
SELECT 
  up.id, 
  u.email,
  up.full_name, 
  up.parent_name, 
  up.child_name, 
  up.role, 
  up.is_active,
  u.raw_user_meta_data
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';

-- 2. Исправляем пользователя (добавляем имя и меняем роль)
UPDATE user_profiles up
SET 
  role = 'newregistration',
  is_active = false,
  full_name = COALESCE(
    (SELECT raw_user_meta_data->>'parent_name' FROM auth.users WHERE id = up.id),
    (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = up.id)
  ),
  parent_name = (SELECT raw_user_meta_data->>'parent_name' FROM auth.users WHERE id = up.id),
  child_name = (SELECT raw_user_meta_data->>'child_name' FROM auth.users WHERE id = up.id)
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';

-- 3. Проверяем результат
SELECT 
  up.id, 
  u.email,
  up.full_name, 
  up.parent_name, 
  up.child_name, 
  up.role,
  up.is_active
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';

-- 4. Проверяем что только один owner в системе
SELECT 
  up.id, 
  u.email, 
  up.full_name, 
  up.role, 
  up.is_active
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.role = 'owner';

-- Должен быть только ОДИН результат - ваш основной аккаунт владельца
