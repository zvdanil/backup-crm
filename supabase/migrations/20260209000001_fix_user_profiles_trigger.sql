-- Исправление триггера создания профиля пользователя
-- Добавлена обработка ошибок и улучшена надежность

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profiles_count integer;
  profile_exists boolean;
BEGIN
  -- Проверяем, существует ли уже профиль (на случай race condition)
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = NEW.id) INTO profile_exists;
  
  IF profile_exists THEN
    -- Профиль уже существует, ничего не делаем
    RETURN NEW;
  END IF;

  -- Подсчитываем количество существующих профилей
  SELECT COUNT(*) INTO profiles_count FROM public.user_profiles;

  -- Пытаемся создать профиль
  BEGIN
    INSERT INTO public.user_profiles (id, full_name, role, is_active)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
      CASE WHEN profiles_count = 0 THEN 'owner' ELSE 'newregistration' END,
      CASE WHEN profiles_count = 0 THEN true ELSE false END
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      -- Логируем ошибку, но не прерываем создание пользователя
      -- Профиль будет создан позже через fetchOrCreateProfile в клиентском коде
      RAISE WARNING 'Failed to create user profile for user %: %', NEW.id, SQLERRM;
      -- Возвращаем NEW, чтобы не блокировать создание пользователя
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- Убеждаемся, что триггер существует и правильно настроен
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Комментарий для документации
COMMENT ON FUNCTION public.handle_new_user_profile() IS 
'Автоматически создает профиль пользователя при регистрации. При ошибке не блокирует создание пользователя, профиль будет создан позже через клиентский код.';
