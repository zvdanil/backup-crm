-- Ищем записи attendance где status выглядит как UUID (не стандартный enum)
SELECT 
  a.id,
  a.date,
  a.status,
  a.notes,
  s.full_name as student_name,
  act.name as activity_name
FROM public.attendance a
JOIN public.enrollments e ON a.enrollment_id = e.id
JOIN public.students s ON e.student_id = s.id
JOIN public.activities act ON e.activity_id = act.id
WHERE a.status NOT IN ('present', 'sick', 'absent', 'vacation')
  AND a.date >= '2026-02-01'
ORDER BY a.date DESC
LIMIT 20;

-- Проверяем все уникальные значения status
SELECT DISTINCT status, COUNT(*) as count
FROM public.attendance
WHERE date >= '2026-02-01'
GROUP BY status
ORDER BY count DESC;
