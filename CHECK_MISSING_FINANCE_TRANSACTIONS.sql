-- Check attendance charges that are missing income transactions
-- Assumes finance_transactions is the source of truth.

-- 1) Aggregate attendance charges by student/activity/date
WITH attendance_charges AS (
  SELECT
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id,
    at.date::date AS date,
    SUM(at.charged_amount) AS charged_amount
  FROM attendance at
  JOIN enrollments e ON e.id = at.enrollment_id
  LEFT JOIN activities a ON a.id = e.activity_id
  WHERE at.charged_amount IS NOT NULL
    AND at.charged_amount <> 0
  GROUP BY e.student_id, e.activity_id, COALESCE(e.account_id, a.account_id), at.date::date
),
income_tx AS (
  SELECT
    student_id,
    activity_id,
    date::date AS date,
    SUM(amount) AS income_amount
  FROM finance_transactions
  WHERE type = 'income'
  GROUP BY student_id, activity_id, date::date
)
SELECT
  ac.student_id,
  ac.activity_id,
  ac.account_id,
  ac.date,
  ac.charged_amount,
  COALESCE(it.income_amount, 0) AS income_amount
FROM attendance_charges ac
LEFT JOIN income_tx it
  ON it.student_id = ac.student_id
  AND it.activity_id = ac.activity_id
  AND it.date = ac.date
WHERE COALESCE(it.income_amount, 0) = 0
ORDER BY ac.date DESC;

-- 2) Find mismatches between attendance charges and income totals
WITH attendance_charges AS (
  SELECT
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id,
    at.date::date AS date,
    SUM(at.charged_amount) AS charged_amount
  FROM attendance at
  JOIN enrollments e ON e.id = at.enrollment_id
  LEFT JOIN activities a ON a.id = e.activity_id
  WHERE at.charged_amount IS NOT NULL
    AND at.charged_amount <> 0
  GROUP BY e.student_id, e.activity_id, COALESCE(e.account_id, a.account_id), at.date::date
),
income_tx AS (
  SELECT
    student_id,
    activity_id,
    date::date AS date,
    SUM(amount) AS income_amount
  FROM finance_transactions
  WHERE type = 'income'
  GROUP BY student_id, activity_id, date::date
)
SELECT
  ac.student_id,
  ac.activity_id,
  ac.account_id,
  ac.date,
  ac.charged_amount,
  COALESCE(it.income_amount, 0) AS income_amount,
  (COALESCE(it.income_amount, 0) - ac.charged_amount) AS diff_amount
FROM attendance_charges ac
LEFT JOIN income_tx it
  ON it.student_id = ac.student_id
  AND it.activity_id = ac.activity_id
  AND it.date = ac.date
WHERE COALESCE(it.income_amount, 0) <> ac.charged_amount
ORDER BY ac.date DESC;

-- 3) OPTIONAL: insert missing income transactions for attendance charges
-- Review results from section 1 before running this.
/*
WITH attendance_charges AS (
  SELECT
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id,
    at.date::date AS date,
    SUM(at.charged_amount) AS charged_amount
  FROM attendance at
  JOIN enrollments e ON e.id = at.enrollment_id
  LEFT JOIN activities a ON a.id = e.activity_id
  WHERE at.charged_amount IS NOT NULL
    AND at.charged_amount <> 0
  GROUP BY e.student_id, e.activity_id, COALESCE(e.account_id, a.account_id), at.date::date
),
income_tx AS (
  SELECT
    student_id,
    activity_id,
    date::date AS date,
    SUM(amount) AS income_amount
  FROM finance_transactions
  WHERE type = 'income'
  GROUP BY student_id, activity_id, date::date
)
INSERT INTO finance_transactions (
  type,
  student_id,
  activity_id,
  account_id,
  amount,
  date,
  description,
  category
)
SELECT
  'income',
  ac.student_id,
  ac.activity_id,
  ac.account_id,
  ac.charged_amount,
  ac.date,
  'Нарахування за відвідування',
  NULL
FROM attendance_charges ac
LEFT JOIN income_tx it
  ON it.student_id = ac.student_id
  AND it.activity_id = ac.activity_id
  AND it.date = ac.date
WHERE COALESCE(it.income_amount, 0) = 0;
*/
