-- ============================================
-- Автоматически распределить все существующие платежи
-- Выполнить ПОСЛЕ применения FIX_DISTRIBUTE_FUNCTION.sql
-- ============================================

-- Этот скрипт автоматически найдёт все платежи без activity_id
-- и распределит их по долгам

DO $$
DECLARE
  payment_record RECORD;
  distribution_result RECORD;
BEGIN
  -- Найти все платежи без activity_id, которые нужно распределить
  FOR payment_record IN
    SELECT 
      ft.id,
      ft.student_id,
      ft.account_id,
      ft.amount,
      ft.date,
      s.full_name AS student_name,
      pa.name AS account_name
    FROM finance_transactions ft
    INNER JOIN students s ON ft.student_id = s.id
    INNER JOIN payment_accounts pa ON ft.account_id = pa.id
    WHERE ft.type = 'payment'
      AND ft.student_id IS NOT NULL
      AND ft.account_id IS NOT NULL
      AND ft.activity_id IS NULL
    ORDER BY ft.date DESC, ft.created_at DESC
  LOOP
    -- Вызвать функцию распределения для каждого платежа
    BEGIN
      SELECT * INTO distribution_result
      FROM public.distribute_advance_payment(
        payment_record.student_id,
        payment_record.account_id,
        payment_record.amount
      );
      
      -- Логируем результат (можно посмотреть в логах Supabase)
      RAISE NOTICE 'Распределён платёж: Студент: %, Счёт: %, Сумма: %, Распределено: %, Остаток: %, Транзакций создано: %',
        payment_record.student_name,
        payment_record.account_name,
        payment_record.amount,
        distribution_result.distributed_amount,
        distribution_result.remaining_advance,
        distribution_result.payments_created;
    EXCEPTION
      WHEN OTHERS THEN
        -- Если ошибка, логируем и продолжаем со следующим платежом
        RAISE WARNING 'Ошибка при распределении платежа ID %: %', payment_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Распределение завершено';
END $$;

-- Проверить результаты:
-- 1. Проверить созданные advance_payment транзакции
SELECT 
  ft.id,
  ft.date,
  s.full_name AS student_name,
  a.name AS activity_name,
  pa.name AS account_name,
  ft.amount,
  ft.description
FROM finance_transactions ft
INNER JOIN students s ON ft.student_id = s.id
LEFT JOIN activities a ON ft.activity_id = a.id
INNER JOIN payment_accounts pa ON ft.account_id = pa.id
WHERE ft.type = 'advance_payment'
ORDER BY ft.created_at DESC
LIMIT 20;

-- 2. Проверить авансовые балансы
SELECT 
  ab.student_id,
  s.full_name AS student_name,
  ab.account_id,
  pa.name AS account_name,
  ab.balance,
  ab.updated_at
FROM advance_balances ab
INNER JOIN students s ON ab.student_id = s.id
INNER JOIN payment_accounts pa ON ab.account_id = pa.id
ORDER BY ab.updated_at DESC;
