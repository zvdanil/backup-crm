-- ============================================
-- Найти данные для активности "Прескул" (subscription)
-- Баланс может рассчитываться из базовой ставки, а не из транзакций
-- ============================================

-- 1. Найти активность "Прескул" и её billing_rules
SELECT 
  id,
  name,
  is_active,
  default_price,
  billing_rules,
  account_id
FROM public.activities
WHERE name = 'Прескул';

-- 2. Найти все enrollments для активности "Прескул"
SELECT 
  e.id,
  e.student_id,
  e.activity_id,
  e.custom_price,
  e.discount_percent,
  e.account_id,
  e.is_active,
  s.full_name as student_name,
  a.name as activity_name
FROM public.enrollments e
LEFT JOIN public.students s ON s.id = e.student_id
LEFT JOIN public.activities a ON a.id = e.activity_id
WHERE a.name = 'Прескул'
ORDER BY s.full_name;

-- 3. Найти enrollment для конкретного студента (если знаете имя)
-- Замените STUDENT_NAME на имя студента
SELECT 
  e.id,
  e.student_id,
  e.activity_id,
  e.custom_price,
  e.discount_percent,
  e.account_id,
  e.is_active,
  s.full_name as student_name,
  a.name as activity_name,
  a.default_price,
  a.billing_rules
FROM public.enrollments e
LEFT JOIN public.students s ON s.id = e.student_id
LEFT JOIN public.activities a ON a.id = e.activity_id
WHERE a.name = 'Прескул'
  AND s.full_name = 'ЗАМЕНИТЕ_НА_STUDENT_NAME';

-- 4. Проверить, есть ли транзакции income для "Прескул" (может быть пусто)
SELECT 
  ft.id,
  ft.student_id,
  ft.activity_id,
  ft.type,
  ft.amount,
  ft.date,
  ft.account_id,
  s.full_name as student_name,
  a.name as activity_name
FROM public.finance_transactions ft
LEFT JOIN public.students s ON s.id = ft.student_id
LEFT JOIN public.activities a ON a.id = ft.activity_id
WHERE a.name = 'Прескул'
  AND ft.type = 'income'
ORDER BY ft.date DESC;

-- ============================================
-- ВАЖНО: Для subscription типа баланс рассчитывается из:
-- 1. enrollment.custom_price (если установлено)
-- 2. Или activity.billing_rules.present.rate (если custom_price = NULL)
-- 3. Или activity.default_price (если billing_rules не установлено)
-- 
-- Транзакции income может НЕ БЫТЬ в БД!
-- ============================================

-- 5. Чтобы "удалить" subscription начисление, нужно:
--    - Либо удалить enrollment (DELETE FROM enrollments WHERE id = 'ENROLLMENT_ID')
--    - Либо установить custom_price = 0 (UPDATE enrollments SET custom_price = 0 WHERE id = 'ENROLLMENT_ID')
--    - Либо изменить billing_rules активности
