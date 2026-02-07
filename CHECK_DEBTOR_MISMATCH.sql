-- ============================================
-- Проверка расхождений: реестр должников vs карточка ребенка
-- Задайте ФИО и месяц/год в params
-- ============================================

-- 0) Найти нужного ребенка по ФИО (часть имени)
WITH params AS (
  SELECT 'Беспалов'::text AS student_name
)
SELECT id, full_name, status
FROM students
WHERE full_name ILIKE '%' || (SELECT student_name FROM params) || '%'
ORDER BY full_name;

-- 1) Основные данные: enrollments и привязка к счетам
WITH params AS (
  SELECT 'e0267646-85c4-4020-bcae-f80a85d03b1d'::uuid AS student_id
)
SELECT
  e.id AS enrollment_id,
  e.activity_id,
  a.name AS activity_name,
  e.account_id AS enrollment_account_id,
  a.account_id AS activity_account_id,
  e.is_active,
  e.unenrolled_at,
  e.enrolled_at
FROM enrollments e
JOIN activities a ON a.id = e.activity_id
WHERE e.student_id = (SELECT student_id FROM params)
ORDER BY a.name;

-- 2) Все финансовые транзакции ребенка
WITH params AS (
  SELECT 'e0267646-85c4-4020-bcae-f80a85d03b1d'::uuid AS student_id
)
SELECT
  date,
  type,
  amount,
  activity_id,
  account_id,
  description
FROM finance_transactions
WHERE student_id = (SELECT student_id FROM params)
  AND type IN ('income', 'payment', 'expense')
ORDER BY date DESC, type;

-- 3) Агрегация по счетам по логике реестра (как в коде)
WITH params AS (
  SELECT
    'e0267646-85c4-4020-bcae-f80a85d03b1d'::uuid AS student_id,
    2026::int AS year,
    2::int AS month
),
month_range AS (
  SELECT
    make_date((SELECT year FROM params), (SELECT month FROM params), 1) AS month_start,
    (make_date((SELECT year FROM params), (SELECT month FROM params), 1) + interval '1 month' - interval '1 day')::date AS month_end
),
activity_account AS (
  SELECT id, account_id
  FROM activities
),
enrollments AS (
  SELECT
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id
  FROM enrollments e
  JOIN activities a ON a.id = e.activity_id
  WHERE e.student_id = (SELECT student_id FROM params)
),
enrollment_counts AS (
  SELECT activity_id, COUNT(*) AS cnt
  FROM enrollments
  GROUP BY activity_id
),
transactions AS (
  SELECT
    student_id,
    activity_id,
    account_id,
    type,
    amount,
    date
  FROM finance_transactions
  WHERE student_id = (SELECT student_id FROM params)
    AND type IN ('income', 'payment', 'expense')
),
transactions_mapped AS (
  SELECT
    tx.student_id,
    tx.activity_id,
    tx.account_id,
    tx.type,
    tx.amount,
    tx.date,
    CASE
      WHEN tx.activity_id IS NULL THEN tx.account_id
      WHEN ec.cnt IS NULL THEN aa.account_id
      ELSE e.account_id
    END AS mapped_account_id,
    CASE
      WHEN tx.activity_id IS NULL THEN 1
      WHEN ec.cnt IS NULL THEN 1
      ELSE ec.cnt
    END AS split_count
  FROM transactions tx
  LEFT JOIN enrollment_counts ec ON ec.activity_id = tx.activity_id
  LEFT JOIN enrollments e ON e.activity_id = tx.activity_id
  LEFT JOIN activity_account aa ON aa.id = tx.activity_id
)
SELECT
  tm.mapped_account_id,
  COALESCE(pa.name, 'Без счета') AS account_name,
  SUM(CASE WHEN tm.type = 'income' THEN tm.amount / tm.split_count ELSE 0 END) AS charges_all,
  SUM(CASE WHEN tm.type = 'payment' THEN tm.amount / tm.split_count ELSE 0 END) AS payments_all,
  SUM(CASE WHEN tm.type = 'expense' THEN tm.amount / tm.split_count ELSE 0 END) AS refunds_all,
  SUM(CASE WHEN tm.type = 'income' AND tm.date::date BETWEEN mr.month_start AND mr.month_end
           THEN tm.amount / tm.split_count ELSE 0 END) AS charges_month,
  SUM(CASE WHEN tm.type = 'payment' AND tm.date::date BETWEEN mr.month_start AND mr.month_end
           THEN tm.amount / tm.split_count ELSE 0 END) AS payments_month,
  SUM(CASE WHEN tm.type = 'payment' THEN tm.amount / tm.split_count ELSE 0 END)
    - SUM(CASE WHEN tm.type = 'income' THEN tm.amount / tm.split_count ELSE 0 END)
    + SUM(CASE WHEN tm.type = 'expense' THEN tm.amount / tm.split_count ELSE 0 END) AS balance_all
FROM transactions_mapped tm
CROSS JOIN month_range mr
LEFT JOIN payment_accounts pa ON pa.id = tm.mapped_account_id
GROUP BY tm.mapped_account_id, pa.name
ORDER BY balance_all ASC;
