-- ============================================
-- Вручную распределить существующие платежи
-- Выполнить ПОСЛЕ применения FIX_DISTRIBUTE_FUNCTION.sql
-- ============================================

-- 1. Найти все платежи без activity_id, которые ещё не распределены
-- (те, для которых нет advance_payment транзакций)

WITH payments_to_distribute AS (
  SELECT 
    ft.id,
    ft.student_id,
    ft.account_id,
    ft.amount,
    ft.date,
    s.full_name AS student_name,
    pa.name AS account_name
  FROM finance_transactions ft
  INNER JOIN students s ON ft.student_id = s.id
  INNER JOIN payment_accounts pa ON ft.account_id = pa.id
  WHERE ft.type = 'payment'
    AND ft.student_id IS NOT NULL
    AND ft.account_id IS NOT NULL
    AND ft.activity_id IS NULL
    -- Проверяем, что для этого платежа ещё не было распределения
    AND NOT EXISTS (
      SELECT 1 
      FROM finance_transactions ft2
      WHERE ft2.type = 'advance_payment'
        AND ft2.student_id = ft.student_id
        AND ft2.account_id = ft.account_id
        AND ft2.date >= ft.date
        AND ft2.description LIKE 'Автоматичне погашення з авансового рахунку'
    )
  ORDER BY ft.date DESC, ft.created_at DESC
)
SELECT 
  id,
  student_id,
  account_id,
  amount,
  date,
  student_name,
  account_name
FROM payments_to_distribute;

-- 2. Для каждого найденного платежа вызвать функцию распределения
-- Раскомментируйте и замените UUID на реальные значения из запроса выше

-- SELECT * FROM public.distribute_advance_payment(
--   'STUDENT_UUID_HERE',  -- student_id из запроса выше
--   'ACCOUNT_UUID_HERE',  -- account_id из запроса выше
--   AMOUNT_HERE  -- amount из запроса выше
-- );

-- Пример для конкретного студента и счёта:
-- SELECT * FROM public.distribute_advance_payment(
--   (SELECT id FROM students WHERE full_name = 'Долінце Злата'),
--   (SELECT id FROM payment_accounts WHERE name = 'ФОП 3'),
--   2450.00
-- );
