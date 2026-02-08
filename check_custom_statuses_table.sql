-- Проверяем существование таблицы custom_attendance_statuses
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'custom_attendance_statuses'
) as table_exists;

-- Проверяем структуру таблицы если она есть
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'custom_attendance_statuses'
ORDER BY ordinal_position;

-- Проверяем RLS политики для этой таблицы
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'custom_attendance_statuses';

-- Проверяем включён ли RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'custom_attendance_statuses';

-- Проверяем есть ли данные
SELECT id, name, counts_as_present, organization_id
FROM custom_attendance_statuses
LIMIT 5;
