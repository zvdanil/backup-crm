-- ============================================
-- Проверить статус распределения платежей
-- ============================================

-- 1. Проверить, есть ли платежи без activity_id
SELECT 
  COUNT(*) AS payments_to_distribute,
  SUM(amount) AS total_amount
FROM finance_transactions
WHERE type = 'payment'
  AND student_id IS NOT NULL
  AND account_id IS NOT NULL
  AND activity_id IS NULL;

-- 2. Проверить, были ли созданы advance_payment транзакции
SELECT 
  COUNT(*) AS advance_payments_count,
  SUM(amount) AS total_distributed
FROM finance_transactions
WHERE type = 'advance_payment';

-- 3. Проверить авансовые балансы
SELECT 
  s.full_name AS student_name,
  pa.name AS account_name,
  ab.balance AS advance_balance,
  ab.updated_at
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
ORDER BY ab.updated_at DESC;

-- 4. Проверить долги по активностям для конкретного студента (Долінце Злата)
SELECT 
  s.full_name AS student_name,
  a.name AS activity_name,
  pa.name AS account_name,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS нараховано,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS оплачено,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS витрати,
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) 
   - COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0)
   - COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS баланс
FROM enrollments e
INNER JOIN students s ON e.student_id = s.id
INNER JOIN activities a ON e.activity_id = a.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, a.account_id) = pa.id
LEFT JOIN finance_transactions ft ON (
  ft.student_id = e.student_id 
  AND ft.activity_id = e.activity_id
  AND ft.account_id IS NOT DISTINCT FROM COALESCE(e.account_id, a.account_id)
)
WHERE s.full_name = 'Долінце Злата'
  AND e.is_active = true
  AND COALESCE(e.account_id, a.account_id) = (SELECT id FROM payment_accounts WHERE name = 'ФОП 3')
GROUP BY s.id, s.full_name, a.id, a.name, pa.id, pa.name
HAVING (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) 
        - COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) > 0
ORDER BY баланс DESC;

-- 5. Проверить, существует ли функция distribute_advance_payment
SELECT 
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'distribute_advance_payment';
