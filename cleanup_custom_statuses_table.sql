-- Удаляем созданную таблицу и поле, они не нужны
DROP TABLE IF EXISTS public.custom_attendance_statuses CASCADE;

ALTER TABLE public.attendance DROP COLUMN IF EXISTS custom_status_id;

-- Проверяем что удалились
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'custom_attendance_statuses';
