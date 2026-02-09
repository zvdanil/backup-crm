-- Проверяем какие статусы используются в attendance для футбола
-- Ищем активность "Футбол" или подобную
SELECT id, name 
FROM public.activities 
WHERE LOWER(name) LIKE '%футбол%' OR LOWER(name) LIKE '%soccer%'
LIMIT 5;

-- Смотрим все записи attendance для этой активности
-- ЗАМЕНИТЕ 'activity_id_here' на ID из результата выше
SELECT 
  a.id,
  a.date,
  a.status,
  a.custom_status_id,
  a.notes,
  s.full_name as student_name
FROM public.attendance a
JOIN public.enrollments e ON a.enrollment_id = e.id
JOIN public.students s ON e.student_id = s.id
WHERE e.activity_id = 'ac90aa1c-34b3-4094-b283-dafa413de938' -- ID футбола из вашего лога
  AND a.date >= '2026-02-01'
ORDER BY a.date DESC;

-- Смотрим все уникальные значения status в attendance
SELECT DISTINCT status, COUNT(*) as count
FROM public.attendance
GROUP BY status
ORDER BY count DESC;

-- Проверяем есть ли записи с custom_status_id
SELECT COUNT(*) as records_with_custom_status
FROM public.attendance
WHERE custom_status_id IS NOT NULL;
