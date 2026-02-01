-- ============================================
-- Найти income транзакцию для активности "Прескул"
-- ============================================

-- 1. Найти ID активности "Прескул"
SELECT id, name, is_active
FROM public.activities
WHERE name = 'Прескул';

-- 2. Найти все income транзакции для этой активности
-- Замените ACTIVITY_ID на ID из первого запроса
SELECT 
  ft.id,
  ft.student_id,
  ft.activity_id,
  ft.type,
  ft.amount,
  ft.date,
  ft.description,
  ft.account_id,
  ft.created_at,
  s.full_name as student_name,
  a.name as activity_name
FROM public.finance_transactions ft
LEFT JOIN public.students s ON s.id = ft.student_id
LEFT JOIN public.activities a ON a.id = ft.activity_id
WHERE ft.activity_id = 'ЗАМЕНИТЕ_НА_ACTIVITY_ID'
  AND ft.type = 'income'
ORDER BY ft.date DESC;

-- 3. Найти income транзакции для всех студентов с активностью "Прескул"
SELECT 
  ft.id,
  ft.student_id,
  ft.activity_id,
  ft.type,
  ft.amount,
  ft.date,
  ft.description,
  ft.account_id,
  ft.created_at,
  s.full_name as student_name,
  a.name as activity_name
FROM public.finance_transactions ft
LEFT JOIN public.students s ON s.id = ft.student_id
LEFT JOIN public.activities a ON a.id = ft.activity_id
WHERE a.name = 'Прескул'
  AND ft.type = 'income'
ORDER BY ft.date DESC;

-- 4. Найти income транзакции для конкретного студента (если знаете имя студента)
-- Замените STUDENT_NAME на имя студента
SELECT 
  ft.id,
  ft.student_id,
  ft.activity_id,
  ft.type,
  ft.amount,
  ft.date,
  ft.description,
  ft.account_id,
  ft.created_at,
  s.full_name as student_name,
  a.name as activity_name
FROM public.finance_transactions ft
LEFT JOIN public.students s ON s.id = ft.student_id
LEFT JOIN public.activities a ON a.id = ft.activity_id
WHERE a.name = 'Прескул'
  AND s.full_name = 'ЗАМЕНИТЕ_НА_STUDENT_NAME'
  AND ft.type = 'income'
ORDER BY ft.date DESC;
