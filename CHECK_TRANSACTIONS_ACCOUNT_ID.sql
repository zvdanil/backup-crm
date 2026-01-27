-- ============================================
-- Проверить account_id в транзакциях
-- ============================================

-- 1. Проверить все транзакции студента и их account_id
SELECT 
  ft.id,
  ft.type,
  ft.date,
  a.name AS activity_name,
  ft.account_id AS transaction_account_id,
  pa.name AS transaction_account_name,
  COALESCE(e.account_id, a.account_id) AS expected_account_id,
  pa2.name AS expected_account_name,
  CASE 
    WHEN ft.account_id IS NOT DISTINCT FROM COALESCE(e.account_id, a.account_id)
    THEN '✅ СОВПАДАЕТ'
    ELSE '❌ НЕ СОВПАДАЕТ'
  END AS match_status,
  ft.amount,
  ft.description
FROM finance_transactions ft
INNER JOIN enrollments e ON ft.student_id = e.student_id AND ft.activity_id = e.activity_id
INNER JOIN activities a ON ft.activity_id = a.id
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
LEFT JOIN payment_accounts pa2 ON COALESCE(e.account_id, a.account_id) = pa2.id
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
ORDER BY ft.date DESC, ft.type;

-- 2. Проверить транзакции типа income (начисления) - должны иметь account_id
SELECT 
  ft.type,
  COUNT(*) AS count,
  COUNT(ft.account_id) AS with_account_id,
  COUNT(*) - COUNT(ft.account_id) AS without_account_id,
  SUM(CASE WHEN ft.account_id IS NULL THEN ft.amount ELSE 0 END) AS amount_without_account
FROM finance_transactions ft
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND ft.type = 'income'
GROUP BY ft.type;

-- 3. Проверить баланс с учётом NULL account_id
WITH enrollment_accounts AS (
  SELECT 
    e.id AS enrollment_id,
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id
  FROM enrollments e
  INNER JOIN activities a ON e.activity_id = a.id
  WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
    AND e.is_active = true
)
SELECT 
  a.name AS activity_name,
  ea.account_id AS enrollment_account_id,
  pa.name AS account_name,
  -- Транзакции с правильным account_id
  COALESCE(SUM(CASE 
    WHEN ft.account_id IS NOT DISTINCT FROM ea.account_id 
    AND ft.type = 'income' 
    THEN ft.amount ELSE 0 END), 0) AS нараховано_правильный_account,
  -- Транзакции с NULL account_id (старые)
  COALESCE(SUM(CASE 
    WHEN ft.account_id IS NULL 
    AND ft.type = 'income' 
    THEN ft.amount ELSE 0 END), 0) AS нараховано_null_account,
  -- Все начисления
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS нараховано_всего,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS оплачено,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS витрати,
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS баланс
FROM enrollment_accounts ea
INNER JOIN activities a ON ea.activity_id = a.id
LEFT JOIN payment_accounts pa ON ea.account_id = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = ea.student_id 
  AND ft.activity_id = ea.activity_id
  -- Включаем транзакции с правильным account_id ИЛИ с NULL (старые транзакции)
  AND (
    ft.account_id IS NOT DISTINCT FROM ea.account_id
    OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
  )
GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, a.name, pa.name
HAVING (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) > 0
ORDER BY баланс DESC;
