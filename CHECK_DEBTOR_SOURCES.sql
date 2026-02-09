-- ============================================
-- Источники расчета: оплаты, начисления из журнала, абонплата
-- Student ID: e0267646-85c4-4020-bcae-f80a85d03b1d
-- ============================================

-- 1) Оплаты (payment) по счетам
SELECT
  date,
  amount,
  account_id,
  activity_id,
  description
FROM finance_transactions
WHERE student_id = 'e0267646-85c4-4020-bcae-f80a85d03b1d'
  AND type = 'payment'
ORDER BY date DESC;

-- 2) Начисления по журналам посещения (attendance)
SELECT
  a.date,
  a.charged_amount,
  a.enrollment_id,
  e.activity_id,
  act.name AS activity_name,
  COALESCE(e.account_id, act.account_id) AS account_id
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN activities act ON act.id = e.activity_id
WHERE e.student_id = 'e0267646-85c4-4020-bcae-f80a85d03b1d'
  AND a.charged_amount IS NOT NULL
  AND a.charged_amount <> 0
ORDER BY a.date DESC;

-- 3) Активности с абонплатой (billing_rules.present.type = fixed/subscription)
SELECT
  e.activity_id,
  act.name AS activity_name,
  act.account_id,
  e.account_id AS enrollment_account_id,
  act.billing_rules->'present'->>'type' AS present_type,
  act.billing_rules->'present'->>'rate' AS present_rate,
  act.default_price,
  act.balance_display_mode,
  e.custom_price,
  e.discount_percent,
  e.is_active,
  e.enrolled_at,
  e.unenrolled_at
FROM enrollments e
JOIN activities act ON act.id = e.activity_id
WHERE e.student_id = 'e0267646-85c4-4020-bcae-f80a85d03b1d'
  AND (act.billing_rules->'present'->>'type') IN ('fixed', 'subscription')
ORDER BY act.name;
