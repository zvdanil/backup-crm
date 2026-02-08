-- Смотрим ВСЕ поля таблицы attendance
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'attendance'
ORDER BY ordinal_position;

-- Смотрим несколько записей для футбола со ВСЕМИ полями
SELECT *
FROM public.attendance a
JOIN public.enrollments e ON a.enrollment_id = e.id
WHERE e.activity_id = 'ac90aa1c-34b3-4094-b283-dafa413de938'
  AND a.date >= '2026-02-01'
ORDER BY a.date DESC
LIMIT 5;
