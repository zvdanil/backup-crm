-- Миграция: создание finance_transactions из существующих attendance записей
-- Этот скрипт создает finance_transactions типа 'income' для всех attendance записей,
-- у которых еще нет соответствующих finance_transactions

-- Определяем account_id: enrollment.account_id ?? activity.account_id
-- Используем INSERT ... ON CONFLICT DO UPDATE для избежания дубликатов

INSERT INTO public.finance_transactions (
  type,
  student_id,
  activity_id,
  account_id,
  amount,
  date,
  description
)
SELECT 
  'income' AS type,
  e.student_id,
  e.activity_id,
  COALESCE(e.account_id, a.account_id) AS account_id,
  att.charged_amount AS amount,
  att.date,
  'Нарахування за відвідування' AS description
FROM public.attendance att
INNER JOIN public.enrollments e ON att.enrollment_id = e.id
INNER JOIN public.activities a ON e.activity_id = a.id
WHERE att.charged_amount > 0
  -- Проверяем, что еще нет соответствующей finance_transaction
  AND NOT EXISTS (
    SELECT 1
    FROM public.finance_transactions ft
    WHERE ft.student_id = e.student_id
      AND ft.activity_id = e.activity_id
      AND ft.date = att.date
      AND ft.type = 'income'
  )
ON CONFLICT DO NOTHING;

-- Выводим статистику
SELECT 
  'Статистика миграции' AS info,
  COUNT(*) AS created_transactions
FROM public.finance_transactions
WHERE type = 'income'
  AND description = 'Нарахування за відвідування'
  AND created_at >= NOW() - INTERVAL '1 minute';
