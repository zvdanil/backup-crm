-- ============================================
-- Диагностика: почему распределение не происходит
-- ============================================

-- 1. Проверить авансовый баланс
SELECT 
  s.full_name AS student_name,
  pa.name AS account_name,
  ab.balance AS advance_balance
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата';

-- 2. Проверить активные записи студента
SELECT 
  e.id AS enrollment_id,
  e.student_id,
  e.activity_id,
  e.account_id AS enrollment_account_id,
  a.name AS activity_name,
  a.account_id AS activity_account_id,
  COALESCE(e.account_id, a.account_id) AS final_account_id,
  pa.name AS account_name,
  e.is_active
FROM enrollments e
INNER JOIN activities a ON e.activity_id = a.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, a.account_id) = pa.id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
  AND e.is_active = true;

-- 3. Проверить транзакции по каждой активности
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
  ea.enrollment_id,
  a.name AS activity_name,
  pa.name AS account_name,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS нараховано,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS оплачено,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS витрати,
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS баланс,
  ea.account_id AS enrollment_account_id,
  (SELECT account_id FROM advance_balances 
   INNER JOIN students ON advance_balances.student_id = students.id 
   WHERE students.full_name = 'Долінце Злата' 
   LIMIT 1) AS advance_account_id,
  CASE 
    WHEN ea.account_id IS NOT DISTINCT FROM (SELECT account_id FROM advance_balances 
                                             INNER JOIN students ON advance_balances.student_id = students.id 
                                             WHERE students.full_name = 'Долінце Злата' 
                                             LIMIT 1)
    THEN 'MATCH'
    ELSE 'NO MATCH'
  END AS account_match
FROM enrollment_accounts ea
INNER JOIN activities a ON ea.activity_id = a.id
LEFT JOIN payment_accounts pa ON ea.account_id = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = ea.student_id 
  AND ft.activity_id = ea.activity_id
  AND (ft.account_id IS NOT DISTINCT FROM ea.account_id)
GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, a.name, pa.name
ORDER BY баланс DESC;

-- 4. Проверить, какие account_id используются в транзакциях
SELECT DISTINCT
  ft.account_id,
  pa.name AS account_name,
  COUNT(*) AS transaction_count
FROM finance_transactions ft
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
GROUP BY ft.account_id, pa.name;

-- 5. Проверить account_id в advance_balances
SELECT 
  ab.account_id,
  pa.name AS account_name
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата';
