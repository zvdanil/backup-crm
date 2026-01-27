-- ============================================
-- Проверить транзакции и их связи с enrollments
-- ============================================

-- 1. Все транзакции студента (без JOIN с enrollments)
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
  -- Проверить, есть ли активный enrollment для этой транзакции
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM enrollments e 
      WHERE e.student_id = ft.student_id 
        AND e.activity_id = ft.activity_id 
        AND e.is_active = true
    ) THEN '✅ Есть активный enrollment'
    WHEN EXISTS (
      SELECT 1 FROM enrollments e 
      WHERE e.student_id = ft.student_id 
        AND e.activity_id = ft.activity_id 
        AND e.is_active = false
    ) THEN '⚠️ Есть неактивный enrollment'
    ELSE '❌ Нет enrollment'
  END AS enrollment_status
FROM finance_transactions ft
LEFT JOIN activities a ON ft.activity_id = a.id
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
ORDER BY ft.date DESC, ft.type;

-- 2. Проверить все enrollments (активные и неактивные)
SELECT 
  e.id AS enrollment_id,
  e.is_active,
  a.name AS activity_name,
  e.student_id,
  e.activity_id,
  COALESCE(e.account_id, a.account_id) AS account_id,
  pa.name AS account_name,
  COUNT(ft.id) AS transaction_count
FROM enrollments e
INNER JOIN activities a ON e.activity_id = a.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, a.account_id) = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = e.student_id 
  AND ft.activity_id = e.activity_id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
GROUP BY e.id, e.is_active, a.name, e.student_id, e.activity_id, e.account_id, a.account_id, pa.name
ORDER BY e.is_active DESC, a.name;

-- 3. Проверить баланс с учётом ВСЕХ enrollments (активных и неактивных)
WITH all_enrollments AS (
  SELECT 
    e.id AS enrollment_id,
    e.student_id,
    e.activity_id,
    e.is_active,
    COALESCE(e.account_id, a.account_id) AS account_id
  FROM enrollments e
  INNER JOIN activities a ON e.activity_id = a.id
  WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
)
SELECT 
  a.name AS activity_name,
  ae.is_active,
  ae.account_id AS enrollment_account_id,
  pa.name AS account_name,
  COUNT(ft.id) AS total_transactions,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS charges,
  COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,
  (COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)) AS balance
FROM all_enrollments ae
INNER JOIN activities a ON ae.activity_id = a.id
LEFT JOIN payment_accounts pa ON ae.account_id = pa.id
LEFT JOIN finance_transactions ft ON 
  ft.student_id = ae.student_id 
  AND ft.activity_id = ae.activity_id
GROUP BY ae.enrollment_id, ae.is_active, ae.account_id, a.name, pa.name
HAVING COUNT(ft.id) > 0 OR COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) > 0
ORDER BY ae.is_active DESC, balance DESC;
