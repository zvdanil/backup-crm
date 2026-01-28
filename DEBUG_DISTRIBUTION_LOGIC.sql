-- ============================================
-- Диагностика логики распределения платежей
-- Автоматически находит студента и счёт по именам
-- ============================================

WITH params AS (
  SELECT
    s.id AS student_id,
    pa.id AS account_id
  FROM students s
  CROSS JOIN payment_accounts pa
  WHERE s.full_name = 'Долінце Злата'
    AND pa.name = 'ФОП З'
  LIMIT 1
),

-- Актуальный авансовый баланс
advance AS (
  SELECT
    ab.student_id,
    ab.account_id,
    ab.balance AS advance_balance
  FROM advance_balances ab
  JOIN params p
    ON ab.student_id = p.student_id
   AND ab.account_id = p.account_id
),

-- Записи на активностях (enrollments + account_id)
enrollment_accounts AS (
  SELECT 
    e.id AS enrollment_id,
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id,
    a.name AS activity_name
  FROM enrollments e
  INNER JOIN activities a ON e.activity_id = a.id
  JOIN params p ON e.student_id = p.student_id
  WHERE e.is_active = true
    AND COALESCE(e.account_id, a.account_id) = (SELECT account_id FROM params)
),

-- Все транзакции по этим активностям и счёту
ft AS (
  SELECT
    ft.id,
    ft.student_id,
    ft.activity_id,
    ft.account_id,
    ft.type,
    ft.amount,
    ft.date,
    ft.description
  FROM finance_transactions ft
  JOIN params p ON ft.student_id = p.student_id
  WHERE ft.account_id IS NOT DISTINCT FROM (SELECT account_id FROM params)
    AND ft.activity_id IN (SELECT activity_id FROM enrollment_accounts)
),

-- Начисления из attendance.charged_amount
att AS (
  SELECT
    a.enrollment_id,
    a.date,
    a.charged_amount
  FROM attendance a
  WHERE a.enrollment_id IN (SELECT enrollment_id FROM enrollment_accounts)
),

-- Расчёт балансов по каждой активности (как в distribute_advance_payment)
enrollment_balances AS (
  SELECT 
    ea.enrollment_id,
    ea.activity_id,
    ea.activity_name,
    ea.account_id,

    -- Charges: сначала из finance_transactions (income), если нет — из attendance.charged_amount
    GREATEST(
      COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0),
      COALESCE(SUM(a.charged_amount), 0)
    ) AS charges,

    COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
    COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,

    GREATEST(
      COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0),
      COALESCE(SUM(a.charged_amount), 0)
    ) 
    - COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS balance

  FROM enrollment_accounts ea
  LEFT JOIN ft 
    ON ft.student_id = ea.student_id 
   AND ft.activity_id = ea.activity_id
   AND (
        ft.account_id IS NOT DISTINCT FROM ea.account_id
        OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
       )
  LEFT JOIN att a 
    ON a.enrollment_id = ea.enrollment_id
   AND NOT EXISTS (
        SELECT 1 
        FROM finance_transactions ft_check 
        WHERE ft_check.student_id = ea.student_id 
          AND ft_check.activity_id = ea.activity_id 
          AND ft_check.type = 'income'
       )
  GROUP BY ea.enrollment_id, ea.activity_id, ea.activity_name, ea.account_id

  HAVING GREATEST(
           COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0),
           COALESCE(SUM(a.charged_amount), 0)
         ) 
         - COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) > 0
)

-- Итог: долги по активностям в том виде, как их видит distribute_advance_payment
SELECT
  eb.activity_name,
  eb.activity_id,
  eb.account_id,
  eb.charges,
  eb.payments,
  eb.refunds,
  eb.balance AS debt_balance,
  COALESCE(adv.advance_balance, 0) AS advance_balance
FROM enrollment_balances eb
LEFT JOIN advance adv
  ON adv.student_id = (SELECT student_id FROM params)
 AND adv.account_id = (SELECT account_id FROM params)
ORDER BY eb.balance DESC;
