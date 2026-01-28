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

-- 3. Вызвать функцию (замените TRANSACTION_ID на реальный ID)
-- SELECT * FROM public.delete_payment_transaction(
--   'TRANSACTION_ID'::UUID,
--   'Тестове видалення'
-- );
