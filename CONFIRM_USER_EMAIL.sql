-- Подтверждение email для пользователя
-- Замените 'test@example.com' на email созданного пользователя

UPDATE auth.users
SET 
  email_confirmed_at = now(),
  confirmed_at = now()
WHERE email = 'test@example.com';

-- Проверка результата
SELECT 
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  created_at
FROM auth.users
WHERE email = 'test@example.com';
