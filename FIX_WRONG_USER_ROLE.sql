-- ============================================
-- Исправление неправильно созданного пользователя
-- ============================================

-- Шаг 1: Проверяем текущую ситуацию
SELECT 
  up.id, 
  u.email,
  up.full_name, 
  up.parent_name, 
  up.child_name, 
  up.role, 
  up.is_active, 
  up.created_at
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
ORDER BY up.created_at;

-- Шаг 2: Находим пользователя без имени с ролью owner
-- (это наш проблемный пользователь)
SELECT 
  up.id, 
  u.email,
  up.full_name, 
  up.parent_name, 
  up.child_name, 
  up.role,
  u.raw_user_meta_data
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.role = 'owner' AND up.full_name IS NULL;

-- Шаг 3: Если это НЕ первый пользователь и НЕ должен быть owner,
-- исправляем роль и добавляем имя из metadata
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
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037'; -- ID из скриншота

-- Шаг 4: Проверяем результат
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

-- ============================================
-- ВНИМАНИЕ!
-- ============================================
-- Если в системе должен быть другой owner (первый пользователь),
-- убедитесь что:
-- 1. У первого пользователя role = 'owner' и is_active = true
-- 2. У всех остальных role != 'owner'
--
-- Чтобы установить правильного owner:
-- UPDATE user_profiles SET role = 'owner', is_active = true 
-- WHERE id = 'ID_ПЕРВОГО_ПОЛЬЗОВАТЕЛЯ';
