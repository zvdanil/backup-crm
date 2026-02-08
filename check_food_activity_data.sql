-- Найдем ID активности "Харчування повний день"
SELECT id, name, payment_type, billing_rules
FROM public.activities
WHERE LOWER(name) LIKE '%харчування%повний%день%'
   OR LOWER(name) LIKE '%харчування повний день%';

-- Если ID известен, проверим все транзакции и attendance для февраля 2026
-- ЗАМЕНИТЕ activity_id_here на реальный ID из результата выше
SELECT 
  'finance_transactions' as source,
  ft.type,
  ft.amount,
  ft.date,
  ft.description,
  s.full_name as student
FROM public.finance_transactions ft
JOIN public.students s ON ft.student_id = s.id
WHERE ft.activity_id = 'activity_id_here'
  AND ft.date >= '2026-02-01'
  AND ft.date <= '2026-02-28'
ORDER BY ft.date;

-- Проверим attendance записи для этого студента и активности
SELECT 
  a.date,
  a.status,
  a.charged_amount,
  s.full_name as student,
  act.name as activity
FROM public.attendance a
JOIN public.enrollments e ON a.enrollment_id = e.id
JOIN public.students s ON e.student_id = s.id
JOIN public.activities act ON e.activity_id = act.id
WHERE act.name LIKE '%Харчування повний день%'
  AND a.date >= '2026-02-01'
  AND a.date <= '2026-02-28'
ORDER BY a.date;
