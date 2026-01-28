-- ============================================
-- Диагностика распределения с учётом возвратов (refunds)
-- Показывает, что видит функция distribute_advance_payment
-- для конкретного студента и счёта за текущий месяц
-- ============================================
-- 
-- ИНСТРУКЦИЯ:
-- 1. Замени 'ИМЯ_СТУДЕНТА' на имя ребёнка из проблемы
-- 2. Замени 'НАЗВАНИЕ_СЧЁТА' на название счёта (например, 'TOB' или 'ФОП З')
-- 3. Выполни скрипт
-- 4. Проверь результаты:
--    - Какие активности попали в список долгов?
--    - Правильно ли считается debt_amount?
--    - Почему долг не был полностью погашен?
-- ============================================

WITH params AS (
  SELECT
    s.id  AS student_id,
    pa.id AS account_id,
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS month_end
  FROM students s
  CROSS JOIN payment_accounts pa
  WHERE s.full_name = 'ИМЯ_СТУДЕНТА'  -- <<< ЗАМЕНИ НА ИМЯ РЕБЁНКА
    AND pa.name      = 'НАЗВАНИЕ_СЧЁТА'  -- <<< ЗАМЕНИ НА НАЗВАНИЕ СЧЁТА
  LIMIT 1
),

enrollment_accounts AS (
  SELECT
    e.id  AS enrollment_id,
    e.student_id,
    e.activity_id,
    COALESCE(e.account_id, a.account_id) AS account_id,
    a.name AS activity_name
  FROM enrollments e
  JOIN activities a ON a.id = e.activity_id
  JOIN params p ON e.student_id = p.student_id
  WHERE e.is_active = true
    AND COALESCE(e.account_id, a.account_id) = p.account_id
),

has_income_monthly AS (
  SELECT DISTINCT
    ea.enrollment_id,
    ea.activity_id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM finance_transactions ft
        JOIN params p ON p.student_id = ft.student_id
        WHERE ft.student_id = ea.student_id
          AND ft.activity_id = ea.activity_id
          AND ft.type = 'income'
          AND ft.date >= p.month_start
          AND ft.date <= p.month_end
          AND (
               ft.account_id IS NOT DISTINCT FROM ea.account_id
            OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
          )
      )
      THEN true
      ELSE false
    END AS has_income
  FROM enrollment_accounts ea
  JOIN params p ON p.student_id = ea.student_id
),

monthly_charges AS (
  SELECT
    ea.enrollment_id,
    ea.activity_id,
    ea.activity_name,
    CASE
      WHEN COALESCE(hi.has_income, false) THEN
        COALESCE(SUM(CASE WHEN ft.type = 'income' AND ft.date >= (SELECT month_start FROM params) AND ft.date <= (SELECT month_end FROM params) THEN ft.amount ELSE 0 END), 0)
      ELSE
        COALESCE(SUM(CASE WHEN att.date >= (SELECT month_start FROM params) AND att.date <= (SELECT month_end FROM params) THEN att.charged_amount ELSE 0 END), 0)
    END AS charges
  FROM enrollment_accounts ea
  LEFT JOIN has_income_monthly hi
    ON hi.enrollment_id = ea.enrollment_id
   AND hi.activity_id   = ea.activity_id
  LEFT JOIN finance_transactions ft
    ON ft.student_id = ea.student_id
   AND ft.activity_id = ea.activity_id
   AND ft.type = 'income'
   AND ft.date >= (SELECT month_start FROM params)
   AND ft.date <= (SELECT month_end FROM params)
   AND (
        ft.account_id IS NOT DISTINCT FROM ea.account_id
     OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
   )
  LEFT JOIN attendance att
    ON att.enrollment_id = ea.enrollment_id
   AND COALESCE(hi.has_income, false) = false
  GROUP BY
    ea.enrollment_id,
    ea.activity_id,
    ea.activity_name,
    hi.has_income
),

monthly_payments AS (
  SELECT
    ea.enrollment_id,
    ea.activity_id,
    COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') AND ft.date >= (SELECT month_start FROM params) AND ft.date <= (SELECT month_end FROM params) THEN ft.amount ELSE 0 END), 0) AS payments,
    COALESCE(SUM(CASE WHEN ft.type = 'expense' AND ft.date >= (SELECT month_start FROM params) AND ft.date <= (SELECT month_end FROM params) THEN ft.amount ELSE 0 END), 0) AS refunds
  FROM enrollment_accounts ea
  LEFT JOIN finance_transactions ft
    ON ft.student_id = ea.student_id
   AND ft.activity_id = ea.activity_id
   AND ft.date >= (SELECT month_start FROM params)
   AND ft.date <= (SELECT month_end FROM params)
   AND (
        ft.account_id IS NOT DISTINCT FROM ea.account_id
     OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
   )
  GROUP BY
    ea.enrollment_id,
    ea.activity_id
),

monthly_debts AS (
  SELECT
    mc.enrollment_id,
    mc.activity_id,
    mc.activity_name,
    mc.charges,
    mp.payments,
    mp.refunds,
    (mc.charges - mp.payments - mp.refunds) AS debt_amount,
    -- Проверка условий фильтрации
    CASE WHEN mc.charges > 0 THEN '✅' ELSE '❌ charges = 0' END AS condition_charges,
    CASE WHEN (mc.charges - mp.payments - mp.refunds) > 0 THEN '✅' ELSE '❌ debt <= 0' END AS condition_debt,
    CASE 
      WHEN mc.charges > 0 AND (mc.charges - mp.payments - mp.refunds) > 0 THEN '✅ ПОПАДЁТ В СПИСОК'
      ELSE '❌ НЕ ПОПАДЁТ В СПИСОК'
    END AS will_be_included
  FROM monthly_charges mc
  JOIN monthly_payments mp
    ON mp.enrollment_id = mc.enrollment_id
   AND mp.activity_id   = mc.activity_id
)

SELECT
  md.activity_name,
  md.charges AS начислено,
  md.payments AS оплачено,
  md.refunds AS возвраты,
  md.debt_amount AS долг_по_формуле,
  -- Показываем, что видит UI (для сравнения)
  (md.payments - md.charges + md.refunds) AS баланс_в_UI,
  md.condition_charges,
  md.condition_debt,
  md.will_be_included,
  -- Порядок гашения (если попадёт в список)
  CASE 
    WHEN md.will_be_included = '✅ ПОПАДЁТ В СПИСОК' 
    THEN ROW_NUMBER() OVER (ORDER BY md.charges DESC, md.debt_amount DESC)
    ELSE NULL
  END AS порядок_гашения
FROM monthly_debts md
ORDER BY 
  md.charges DESC,
  md.debt_amount DESC;
