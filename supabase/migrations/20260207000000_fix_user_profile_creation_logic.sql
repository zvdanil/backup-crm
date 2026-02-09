-- ============================================
-- Fix user profile creation logic
-- Проблемы:
-- 1. Новые пользователи получают роль 'owner' если база пустая
-- 2. Имена не сохраняются из-за timing проблем с user_metadata
-- ============================================

-- Улучшенная функция создания профиля
-- Ищет существующего owner, а не просто считает профили
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_owner boolean;
  profile_exists boolean;
BEGIN
  -- Проверяем, существует ли уже профиль (на случай race condition)
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = NEW.id) INTO profile_exists;
  
  IF profile_exists THEN
    -- Профиль уже существует, ничего не делаем
    RETURN NEW;
  END IF;

  -- Проверяем, существует ли уже owner в системе
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE role = 'owner') INTO has_owner;

  -- Пытаемся создать профиль
  BEGIN
    INSERT INTO public.user_profiles (id, full_name, parent_name, child_name, role, is_active)
    VALUES (
      NEW.id,
      -- Извлекаем имя из user_metadata
      COALESCE(
        NEW.raw_user_meta_data->>'parent_name',
        NEW.raw_user_meta_data->>'full_name', 
        NEW.raw_user_meta_data->>'name'
      ),
      NEW.raw_user_meta_data->>'parent_name',
      NEW.raw_user_meta_data->>'child_name',
      -- Только если нет owner, новый пользователь станет owner
      CASE WHEN NOT has_owner THEN 'owner' ELSE 'newregistration' END,
      -- Owner активен, остальные нет
      CASE WHEN NOT has_owner THEN true ELSE false END
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Логируем в PostgreSQL logs
    RAISE NOTICE 'Created user profile for user % with role % and metadata: parent_name=%, child_name=%', 
      NEW.id,
      CASE WHEN NOT has_owner THEN 'owner' ELSE 'newregistration' END,
      NEW.raw_user_meta_data->>'parent_name',
      NEW.raw_user_meta_data->>'child_name';
      
  EXCEPTION
    WHEN OTHERS THEN
      -- Логируем ошибку, но не прерываем создание пользователя
      RAISE WARNING 'Failed to create user profile for user %: %. Metadata: %', NEW.id, SQLERRM, NEW.raw_user_meta_data;
      -- Профиль будет создан позже через fetchOrCreateProfile в клиентском коде
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- Пересоздаем триггер
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Комментарий для документации
COMMENT ON FUNCTION public.handle_new_user_profile() IS 
'Автоматически создает профиль пользователя при регистрации. Первый пользователь в системе (определяется по отсутствию роли owner) получает роль owner и активируется автоматически. Остальные получают роль newregistration и требуют активации администратором.';
