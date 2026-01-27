-- ============================================
-- Тест функции распределения напрямую
-- Для студента "Долінце Злата" и счёта "ФОП 3"
-- ============================================

-- Сначала проверим, какой авансовый баланс есть
SELECT 
  s.full_name AS student_name,
  pa.name AS account_name,
  ab.balance AS current_advance_balance
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата'
  AND pa.name = 'ФОП 3';

-- Сначала проверим, что account_id найден
DO $$
DECLARE
  v_student_id UUID;
  v_account_id UUID;
BEGIN
  SELECT id INTO v_student_id FROM students WHERE full_name = 'Долінце Злата';
  SELECT id INTO v_account_id FROM payment_accounts WHERE name = 'ФОП 3';
  
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Студент "Долінце Злата" не найден';
  END IF;
  
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Счёт "ФОП 3" не найден. Проверьте название счёта в таблице payment_accounts';
  END IF;
  
  RAISE NOTICE 'Найдены: student_id = %, account_id = %', v_student_id, v_account_id;
END $$;

-- Теперь вызовем функцию распределения
-- Она должна распределить весь авансовый баланс (2450 ₴) по долгам
SELECT * FROM public.distribute_advance_payment(
  (SELECT id FROM students WHERE full_name = 'Долінце Злата'),
  (SELECT id FROM payment_accounts WHERE name = 'ФОП 3'),
  2450.00
);

-- Проверим результат - должны появиться advance_payment транзакции
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

-- Проверим обновлённый авансовый баланс
SELECT 
  s.full_name AS student_name,
  pa.name AS account_name,
  ab.balance AS remaining_advance_balance
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
WHERE s.full_name = 'Долінце Злата'
  AND pa.name = 'ФОП 3';
