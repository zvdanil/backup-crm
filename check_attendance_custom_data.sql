-- Проверяем есть ли кастомные статусы в базе
SELECT id, name, counts_as_present, created_at
FROM public.custom_attendance_statuses
ORDER BY name;

-- Проверяем есть ли записи attendance с custom_status_id
SELECT 
  a.id,
  a.date,
  a.status,
  a.custom_status_id,
  cas.name as custom_status_name,
  cas.counts_as_present,
  s.full_name as student_name,
  act.name as activity_name
FROM public.attendance a
LEFT JOIN public.custom_attendance_statuses cas ON a.custom_status_id = cas.id
LEFT JOIN public.enrollments e ON a.enrollment_id = e.id
LEFT JOIN public.students s ON e.student_id = s.id
LEFT JOIN public.activities act ON e.activity_id = act.id
WHERE a.custom_status_id IS NOT NULL
ORDER BY a.date DESC
LIMIT 20;

-- Считаем статистику
SELECT 
  'Total attendance records' as metric,
  COUNT(*) as count
FROM public.attendance
UNION ALL
SELECT 
  'With custom_status_id' as metric,
  COUNT(*) as count
FROM public.attendance
WHERE custom_status_id IS NOT NULL
UNION ALL
SELECT 
  'With status=present' as metric,
  COUNT(*) as count
FROM public.attendance
WHERE status = 'present';
