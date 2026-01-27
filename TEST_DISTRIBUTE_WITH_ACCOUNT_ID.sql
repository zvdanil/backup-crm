-- ============================================
-- Тест функции распределения с правильным account_id
-- Сначала найдём account_id из advance_balances
-- ============================================

-- 1. Найти account_id из существующего авансового баланса
SELECT 
  ab.student_id,
  s.full_name AS student_name,
  ab.account_id,
  pa.name AS account_name,
  ab.balance
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата'
  AND ab.balance > 0;

-- 2. Использовать найденный account_id для вызова функции
-- ЗАМЕНИТЕ UUID НИЖЕ на реальный account_id из запроса выше
/*
SELECT * FROM public.distribute_advance_payment(
  (SELECT id FROM students WHERE full_name = 'Долінце Злата'),
  'ЗАМЕНИТЕ_НА_ACCOUNT_ID_ИЗ_ЗАПРОСА_ВЫШЕ',  -- Вставьте UUID из первого запроса
  2450.00
);
*/

-- 3. Альтернативный вариант: использовать account_id напрямую из advance_balances
SELECT * FROM public.distribute_advance_payment(
  (SELECT student_id FROM advance_balances 
   INNER JOIN students ON advance_balances.student_id = students.id 
   WHERE students.full_name = 'Долінце Злата' 
   AND balance > 0 
   LIMIT 1),
  (SELECT account_id FROM advance_balances 
   INNER JOIN students ON advance_balances.student_id = students.id 
   WHERE students.full_name = 'Долінце Злата' 
   AND balance > 0 
   LIMIT 1),
  (SELECT balance FROM advance_balances 
   INNER JOIN students ON advance_balances.student_id = students.id 
   WHERE students.full_name = 'Долінце Злата' 
   AND balance > 0 
   LIMIT 1)
);

-- 4. Проверим результат
SELECT 
  ft.id,
  ft.date,
  ft.type,
  s.full_name AS student_name,
  a.name AS activity_name,
  pa.name AS account_name,
  ft.amount,
  ft.description,
  ft.created_at
FROM finance_transactions ft
INNER JOIN students s ON ft.student_id = s.id
LEFT JOIN activities a ON ft.activity_id = a.id
INNER JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.type = 'advance_payment'
  AND s.full_name = 'Долінце Злата'
ORDER BY ft.created_at DESC
LIMIT 10;
