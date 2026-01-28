-- ============================================
-- Тест функции delete_payment_transaction
-- ============================================

-- 1. Найти платеж для тестирования
SELECT 
  ft.id,
  ft.type,
  ft.date,
  ft.amount,
  ft.student_id,
  ft.account_id,
  s.full_name AS student_name,
  pa.name AS account_name
FROM finance_transactions ft
INNER JOIN students s ON ft.student_id = s.id
LEFT JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.type = 'payment'
  AND ft.student_id IS NOT NULL
  AND ft.account_id IS NOT NULL
ORDER BY ft.date DESC
LIMIT 5;

-- 2. Проверить, есть ли advance_payment транзакции для этого платежа
-- (замените TRANSACTION_ID на реальный ID из запроса выше)
/*
SELECT 
  ft.id,
  ft.type,
  ft.date,
  ft.amount,
  ft.description
FROM finance_transactions ft
WHERE ft.type = 'advance_payment'
  AND ft.student_id = (SELECT student_id FROM finance_transactions WHERE id = 'TRANSACTION_ID')
  AND ft.account_id = (SELECT account_id FROM finance_transactions WHERE id = 'TRANSACTION_ID')
  AND ft.date >= (SELECT date FROM finance_transactions WHERE id = 'TRANSACTION_ID')
ORDER BY ft.date DESC;
*/

-- 3. Проверить advance_payment транзакции для первого платежа
-- (замените TRANSACTION_ID на реальный ID из запроса выше, например: d8d239ff-65d4-4315-b83b-af887e993d33)
/*
SELECT 
  ft.id,
  ft.type,
  ft.date,
  ft.amount,
  ft.description,
  ft.student_id,
  ft.account_id
FROM finance_transactions ft
WHERE ft.type = 'advance_payment'
  AND ft.student_id = (SELECT student_id FROM finance_transactions WHERE id = 'd8d239ff-65d4-4315-b83b-af887e993d33')
  AND ft.account_id = (SELECT account_id FROM finance_transactions WHERE id = 'd8d239ff-65d4-4315-b83b-af887e993d33')
  AND ft.date >= (SELECT date FROM finance_transactions WHERE id = 'd8d239ff-65d4-4315-b83b-af887e993d33')
ORDER BY ft.date DESC;
*/

-- 4. Проверить advance_balance для студента
/*
SELECT 
  ab.student_id,
  ab.account_id,
  ab.balance,
  s.full_name AS student_name,
  pa.name AS account_name
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE ab.student_id = (SELECT student_id FROM finance_transactions WHERE id = 'd8d239ff-65d4-4315-b83b-af887e993d33')
  AND ab.account_id = (SELECT account_id FROM finance_transactions WHERE id = 'd8d239ff-65d4-4315-b83b-af887e993d33');
*/

-- 5. Вызвать функцию (замените TRANSACTION_ID на реальный ID)
-- ВНИМАНИЕ: Это удалит платеж! Используйте только для тестирования!
/*
SELECT * FROM public.delete_payment_transaction(
  'd8d239ff-65d4-4315-b83b-af887e993d33'::UUID,
  'Тестове видалення'
);
*/
