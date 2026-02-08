-- Проверяем структуру таблицы profiles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- Ищем таблицы содержащие "org" в названии
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name LIKE '%org%';

-- Проверяем есть ли поле organization_id в profiles
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name LIKE '%org%';
