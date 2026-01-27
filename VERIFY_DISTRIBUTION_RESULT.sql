-- ============================================
-- Проверить результат распределения
-- ============================================

-- 1. Проверить обновлённый авансовый баланс
SELECT 
  s.full_name AS student_name,
  pa.name AS account_name,
  ab.balance AS remaining_advance_balance,
  ab.updated_at
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата';

-- 2. Проверить созданные advance_payment транзакции
SELECT 
  ft.id,
  ft.date,
  ft.type,
  s.full_name AS student_name,
  a.name AS activity_name,
  pa.name AS account_name,
  ft.amount,
  ft.description,
  ft.created_at
FROM finance_transactions ft
INNER JOIN students s ON ft.student_id = s.id
LEFT JOIN activities a ON ft.activity_id = a.id
INNER JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.type = 'advance_payment'
  AND s.full_name = 'Долінце Злата'
ORDER BY ft.created_at DESC;

-- 3. Проверить баланс по активностям (должен быть 0 или положительный)
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
  pa.name AS account_name,
  -- Charges: из finance_transactions ИЛИ из attendance
  GREATEST(
    COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0),
    COALESCE(SUM(att.charged_amount), 0)
  ) AS charges,
  -- Payments: включая advance_payment
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,
  -- Баланс
  GREATEST(
    COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0),
    COALESCE(SUM(att.charged_amount), 0)
  ) - 
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS balance
FROM enrollment_accounts ea
INNER JOIN activities a ON ea.activity_id = a.id
LEFT JOIN payment_accounts pa ON ea.account_id = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = ea.student_id 
  AND ft.activity_id = ea.activity_id
  AND (
    ft.account_id IS NOT DISTINCT FROM ea.account_id
    OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
  )
LEFT JOIN attendance att ON att.enrollment_id = ea.enrollment_id
GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, a.name, pa.name
ORDER BY a.name;
