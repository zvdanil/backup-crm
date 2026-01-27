-- ============================================
-- Проверить совпадение account_id между авансом и долгами
-- ============================================

-- 1. Account_id из advance_balances
SELECT 
  'Авансовый баланс' AS source,
  ab.account_id,
  pa.name AS account_name,
  ab.balance
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата';

-- 2. Account_id из enrollments и activities
SELECT 
  'Записи на активности' AS source,
  COALESCE(e.account_id, a.account_id) AS account_id,
  pa.name AS account_name,
  a.name AS activity_name,
  e.account_id AS enrollment_account_id,
  a.account_id AS activity_account_id
FROM enrollments e
INNER JOIN activities a ON e.activity_id = a.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, a.account_id) = pa.id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND e.is_active = true;

-- 3. Account_id из транзакций (income)
SELECT 
  'Транзакции начислений' AS source,
  ft.account_id,
  pa.name AS account_name,
  a.name AS activity_name,
  COUNT(*) AS transaction_count,
  SUM(ft.amount) AS total_amount
FROM finance_transactions ft
INNER JOIN activities a ON ft.activity_id = a.id
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND ft.type = 'income'
GROUP BY ft.account_id, pa.name, a.name
ORDER BY a.name;

-- 4. Проверить балансы по активностям с правильным account_id
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
),
advance_account_id AS (
  SELECT account_id 
  FROM advance_balances 
  INNER JOIN students ON advance_balances.student_id = students.id 
  WHERE students.full_name = 'Долінце Злата' 
  LIMIT 1
)
SELECT 
  a.name AS activity_name,
  pa.name AS account_name,
  ea.account_id AS enrollment_account_id,
  (SELECT account_id FROM advance_account_id) AS advance_account_id,
  CASE 
    WHEN ea.account_id IS NOT DISTINCT FROM (SELECT account_id FROM advance_account_id)
    THEN '✅ СОВПАДАЕТ'
    ELSE '❌ НЕ СОВПАДАЕТ'
  END AS match_status,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS нараховано,
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
  AND (ft.account_id IS NOT DISTINCT FROM ea.account_id)
GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, a.name, pa.name
HAVING (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) > 0
ORDER BY баланс DESC;
