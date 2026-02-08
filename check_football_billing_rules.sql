-- Смотрим активность "Футбол" и её кастомные статусы
SELECT 
  id,
  name,
  billing_rules
FROM public.activities
WHERE id = 'ac90aa1c-34b3-4094-b283-dafa413de938';

-- Смотрим attendance для футбола
SELECT 
  a.id,
  a.date,
  a.status,
  a.notes,
  s.full_name as student_name
FROM public.attendance a
JOIN public.enrollments e ON a.enrollment_id = e.id
JOIN public.students s ON e.student_id = s.id  
WHERE e.activity_id = 'ac90aa1c-34b3-4094-b283-dafa413de938'
  AND a.date >= '2026-02-01'
ORDER BY a.date DESC
LIMIT 10;
