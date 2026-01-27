-- ============================================
-- Проверить данные в таблице attendance
-- Интерфейс использует attendance как fallback, если нет finance_transactions
-- ============================================

-- 1. Проверить записи attendance для студента
SELECT 
  a.id AS attendance_id,
  a.enrollment_id,
  a.date,
  a.status,
  a.charged_amount,
  a.value,
  e.is_active AS enrollment_is_active,
  e.student_id,
  e.activity_id,
  act.name AS activity_name,
  COALESCE(e.account_id, act.account_id) AS enrollment_account_id,
  pa.name AS account_name
FROM attendance a
INNER JOIN enrollments e ON a.enrollment_id = e.id
INNER JOIN activities act ON e.activity_id = act.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, act.account_id) = pa.id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
ORDER BY a.date DESC
LIMIT 20;

-- 2. Проверить суммарные charged_amount по активностям
SELECT 
  act.name AS activity_name,
  e.is_active AS enrollment_is_active,
  COALESCE(e.account_id, act.account_id) AS enrollment_account_id,
  pa.name AS account_name,
  COUNT(a.id) AS attendance_count,
  SUM(a.charged_amount) AS total_charged_amount
FROM attendance a
INNER JOIN enrollments e ON a.enrollment_id = e.id
INNER JOIN activities act ON e.activity_id = act.id
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, act.account_id) = pa.id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
GROUP BY act.name, e.is_active, e.account_id, act.account_id, pa.name
ORDER BY total_charged_amount DESC;

-- 3. Проверить, совпадает ли account_id из attendance с авансовым балансом
WITH advance_info AS (
  SELECT 
    ab.account_id AS advance_account_id
  FROM advance_balances ab
  INNER JOIN students s ON ab.student_id = s.id
  WHERE s.full_name = 'Долінце Злата'
  LIMIT 1
)
SELECT 
  act.name AS activity_name,
  e.is_active AS enrollment_is_active,
  COALESCE(e.account_id, act.account_id) AS enrollment_account_id,
  ai.advance_account_id,
  CASE 
    WHEN COALESCE(e.account_id, act.account_id) = ai.advance_account_id THEN '✅ MATCH'
    ELSE '❌ NO MATCH'
  END AS account_match,
  COUNT(a.id) AS attendance_count,
  SUM(a.charged_amount) AS total_charged_amount
FROM attendance a
INNER JOIN enrollments e ON a.enrollment_id = e.id
INNER JOIN activities act ON e.activity_id = act.id
CROSS JOIN advance_info ai
LEFT JOIN payment_accounts pa ON COALESCE(e.account_id, act.account_id) = pa.id
WHERE e.student_id = (SELECT id FROM students WHERE full_name = 'Долінце Злата')
GROUP BY act.name, e.is_active, e.account_id, act.account_id, pa.name, ai.advance_account_id
ORDER BY total_charged_amount DESC;
