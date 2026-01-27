-- ============================================
-- Найти транзакции income (начисления)
-- Проверить, почему они не находятся в функции распределения
-- ============================================

-- 1. Все транзакции income для студента
SELECT 
  ft.id,
  ft.type,
  ft.date,
  ft.student_id,
  ft.activity_id,
  ft.account_id,
  a.name AS activity_name,
  pa.name AS account_name,
  ft.amount,
  ft.description,
  -- Найти enrollment для этой транзакции
  e.id AS enrollment_id,
  e.is_active AS enrollment_is_active,
  COALESCE(e.account_id, a.account_id) AS enrollment_account_id,
  CASE 
    WHEN e.id IS NULL THEN '❌ Нет enrollment'
    WHEN e.is_active = true AND COALESCE(e.account_id, a.account_id) = ft.account_id THEN '✅ Активный + account_id совпадает'
    WHEN e.is_active = true THEN '⚠️ Активный, но account_id не совпадает'
    WHEN e.is_active = false THEN '⚠️ Неактивный enrollment'
  END AS enrollment_status
FROM finance_transactions ft
LEFT JOIN activities a ON ft.activity_id = a.id
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
LEFT JOIN enrollments e ON 
  e.student_id = ft.student_id 
  AND e.activity_id = ft.activity_id
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND ft.type = 'income'
ORDER BY ft.date DESC;

-- 2. Проверить баланс по активностям (включая все enrollments)
WITH advance_info AS (
  SELECT 
    ab.account_id AS advance_account_id
  FROM advance_balances ab
  INNER JOIN students s ON ab.student_id = s.id
  WHERE s.full_name = 'Долінце Злата'
  LIMIT 1
)
SELECT 
  a.name AS activity_name,
  e.id AS enrollment_id,
  e.is_active,
  COALESCE(e.account_id, a.account_id) AS enrollment_account_id,
  ai.advance_account_id,
  CASE 
    WHEN COALESCE(e.account_id, a.account_id) = ai.advance_account_id THEN '✅ MATCH'
    ELSE '❌ NO MATCH'
  END AS account_match,
  COUNT(ft.id) AS transaction_count,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS charges,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS balance
FROM activities a
INNER JOIN enrollments e ON e.activity_id = a.id
CROSS JOIN advance_info ai
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, a.account_id) = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = e.student_id 
  AND ft.activity_id = e.activity_id
  AND (
    ft.account_id IS NOT DISTINCT FROM COALESCE(e.account_id, a.account_id)
    OR (ft.account_id IS NULL AND COALESCE(e.account_id, a.account_id) IS NOT NULL)
  )
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND a.name IN ('Логопед', 'Артстудия творча', 'Артстудія')
GROUP BY e.id, e.is_active, a.name, e.account_id, a.account_id, pa.name, ai.advance_account_id
HAVING COUNT(ft.id) > 0 OR COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) > 0
ORDER BY e.is_active DESC, balance DESC;

-- 3. Проверить, может быть транзакции income созданы без activity_id?
SELECT 
  ft.type,
  COUNT(*) AS count,
  COUNT(ft.activity_id) AS with_activity_id,
  COUNT(*) - COUNT(ft.activity_id) AS without_activity_id,
  SUM(ft.amount) AS total_amount
FROM finance_transactions ft
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND ft.type = 'income'
GROUP BY ft.type;
