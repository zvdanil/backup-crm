-- ============================================================
-- Створення першого користувача з роллю owner у Railway
-- ============================================================
-- Виконання: Railway → PostgreSQL → Raw SQL (або psql)
--
-- 1. Підключіться до БД Railway (Raw SQL Tab або psql).
-- 2. Увімкніть pgcrypto (якщо ще не увімкнено):
--    CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 3. Замініть 'zd@ukr.net' та 'YOUR_PASSWORD' на свій email і пароль.
-- 4. Виконайте весь скрипт.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH new_user AS (
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    gen_random_uuid(),
    'zd@ukr.net',
    jsonb_build_object(
      'password_hash', crypt('in09122206', gen_salt('bf', 10)),
      'full_name', 'Admin',
      'parent_name', 'Admin',
      'child_name', 'Admin'
    )
  )
  RETURNING id
)
INSERT INTO public.user_profiles (id, full_name, parent_name, child_name, role, is_active)
SELECT id, 'Admin', 'Admin', 'Admin', 'owner', true FROM new_user;

-- Після виконання увійдіть у додаток з цим email і паролем.
