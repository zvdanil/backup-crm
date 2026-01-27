-- ============================================
-- Найти долги для распределения
-- Проверить, почему функция не находит долги
-- ============================================

-- 1. Получить account_id из advance_balances
WITH advance_info AS (
  SELECT 
    ab.student_id,
    ab.account_id AS advance_account_id,
    ab.balance AS advance_balance
  FROM advance_balances ab
  INNER JOIN students s ON ab.student_id = s.id
  WHERE s.full_name = 'Долінце Злата'
  LIMIT 1
)
-- 2. Найти enrollments с правильным account_id
SELECT 
  'Enrollments' AS step,
  e.id AS enrollment_id,
  a.name AS activity_name,
  COALESCE(e.account_id, a.account_id) AS enrollment_account_id,
  ai.advance_account_id,
  CASE 
    WHEN COALESCE(e.account_id, a.account_id) = ai.advance_account_id THEN '✅ MATCH'
    ELSE '❌ NO MATCH'
  END AS account_match,
  e.is_active
FROM enrollments e
INNER JOIN activities a ON e.activity_id = a.id
CROSS JOIN advance_info ai
WHERE e.student_id = ai.student_id
  AND e.is_active = true;

-- 3. Проверить транзакции и балансы
WITH advance_info AS (
  SELECT 
    ab.student_id,
    ab.account_id AS advance_account_id,
    ab.balance AS advance_balance
  FROM advance_balances ab
  INNER JOIN students s ON ab.student_id = s.id
  WHERE s.full_name = 'Долінце Злата'
  LIMIT 1
),
enrollment_accounts AS (
  SELECT 
    e.id AS enrollment_id,
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id
  FROM enrollments e
  INNER JOIN activities a ON e.activity_id = a.id
  CROSS JOIN advance_info ai
  WHERE e.student_id = ai.student_id
    AND e.is_active = true
    AND COALESCE(e.account_id, a.account_id) = ai.advance_account_id
)
SELECT 
  'Balance Calculation' AS step,
  a.name AS activity_name,
  ea.account_id,
  -- Все транзакции (для отладки)
  COUNT(ft.id) AS total_transactions,
  COUNT(CASE WHEN ft.type = 'income' THEN 1 END) AS income_count,
  COUNT(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN 1 END) AS payment_count,
  COUNT(CASE WHEN ft.type = 'expense' THEN 1 END) AS expense_count,
  -- Суммы
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS charges,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,
  -- Баланс
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS balance,
  -- Проверка условия HAVING
  CASE 
    WHEN (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) > 0
    THEN '✅ HAS DEBT'
    ELSE '❌ NO DEBT'
  END AS debt_status
FROM enrollment_accounts ea
INNER JOIN activities a ON ea.activity_id = a.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = ea.student_id 
  AND ft.activity_id = ea.activity_id
  AND (
    ft.account_id IS NOT DISTINCT FROM ea.account_id
    OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
  )
GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, a.name
ORDER BY balance DESC;

-- 4. Проверить, какие транзакции есть для каждой активности
WITH advance_info AS (
  SELECT 
    ab.student_id,
    ab.account_id AS advance_account_id
  FROM advance_balances ab
  INNER JOIN students s ON ab.student_id = s.id
  WHERE s.full_name = 'Долінце Злата'
  LIMIT 1
)
SELECT 
  a.name AS activity_name,
  ft.type,
  ft.account_id AS transaction_account_id,
  COALESCE(e.account_id, a.account_id) AS expected_account_id,
  CASE 
    WHEN ft.account_id IS NOT DISTINCT FROM COALESCE(e.account_id, a.account_id) THEN '✅ MATCH'
    WHEN ft.account_id IS NULL AND COALESCE(e.account_id, a.account_id) IS NOT NULL THEN '⚠️ NULL (old)'
    ELSE '❌ NO MATCH'
  END AS match_status,
  COUNT(*) AS count,
  SUM(ft.amount) AS total_amount
FROM finance_transactions ft
INNER JOIN enrollments e ON ft.student_id = e.student_id AND ft.activity_id = e.activity_id
INNER JOIN activities a ON ft.activity_id = a.id
CROSS JOIN advance_info ai
WHERE ft.student_id = ai.student_id
GROUP BY a.name, ft.type, ft.account_id, e.account_id, a.account_id
ORDER BY a.name, ft.type;
