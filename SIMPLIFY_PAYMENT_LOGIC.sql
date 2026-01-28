-- ============================================
-- Упрощение логики платежей
-- Убираем сложное распределение по активностям (waterfall)
-- Оставляем простую логику: платежи увеличивают авансовый баланс по счёту
-- ============================================

-- ============================================
-- ШАГ 1: Удаляем старые функции и триггеры
-- ============================================

-- Удаляем триггер автоматического распределения
DROP TRIGGER IF EXISTS on_payment_transaction_created ON public.finance_transactions;

-- Удаляем функцию триггера
DROP FUNCTION IF EXISTS public.handle_payment_transaction();

-- Удаляем функцию распределения (все перегрузки)
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID);

-- Удаляем функцию автоматического списания с аванса
DROP FUNCTION IF EXISTS public.auto_charge_from_advance(UUID, UUID, UUID, DECIMAL);

-- Удаляем функцию пересчёта распределения
DROP FUNCTION IF EXISTS public.rebuild_advance_distribution(UUID, UUID);

-- ============================================
-- ШАГ 2: Создаём упрощённый триггер для обновления авансового баланса
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_payment_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Просто увеличиваем авансовый баланс при создании платежа
  -- Без распределения по активностям
  IF NEW.type = 'payment' 
     AND NEW.student_id IS NOT NULL 
     AND NEW.account_id IS NOT NULL 
     AND NEW.amount > 0 THEN
    
    -- Увеличиваем авансовый баланс
    INSERT INTO public.advance_balances (student_id, account_id, balance)
    VALUES (NEW.student_id, NEW.account_id, NEW.amount)
    ON CONFLICT (student_id, account_id)
    DO UPDATE SET
      balance = advance_balances.balance + NEW.amount,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_payment_transaction() IS 
'Упрощённая логика: просто увеличивает авансовый баланс при создании платежа. Без распределения по активностям.';

-- Создаём триггер
CREATE TRIGGER on_payment_transaction_created
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payment_transaction();

-- ============================================
-- ШАГ 3: Упрощаем функцию удаления платежа
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_payment_transaction(
  p_transaction_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_record RECORD;
  v_advance_balance DECIMAL(10,2) := 0;
  v_result JSON;
BEGIN
  -- Получаем данные платежа
  SELECT 
    id,
    student_id,
    account_id,
    amount,
    date
  INTO v_payment_record
  FROM public.finance_transactions
  WHERE id = p_transaction_id
    AND type = 'payment';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment transaction not found: %', p_transaction_id;
  END IF;
  
  -- Если нет student_id или account_id, просто удаляем платеж
  IF v_payment_record.student_id IS NULL OR v_payment_record.account_id IS NULL THEN
    DELETE FROM public.finance_transactions
    WHERE id = p_transaction_id;
    
    v_result := json_build_object(
      'deleted_payment_amount', v_payment_record.amount::numeric,
      'remaining_advance_balance', 0::numeric,
      'message', 'Payment deleted without advance rollback due to missing student_id or account_id'
    );
    
    RETURN v_result;
  END IF;

  -- Уменьшаем авансовый баланс на сумму платежа
  UPDATE public.advance_balances
  SET balance = GREATEST(0, balance - v_payment_record.amount),
      updated_at = now()
  WHERE student_id = v_payment_record.student_id
    AND account_id = v_payment_record.account_id;

  -- Получаем оставшийся авансовый баланс
  SELECT COALESCE(balance, 0) INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = v_payment_record.student_id
    AND account_id = v_payment_record.account_id;

  -- Удаляем сам платёж
  DELETE FROM public.finance_transactions
  WHERE id = p_transaction_id;
  
  -- Возвращаем результат
  v_result := json_build_object(
    'deleted_payment_amount', v_payment_record.amount::numeric,
    'remaining_advance_balance', COALESCE(v_advance_balance, 0)::numeric
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in delete_payment_transaction: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.delete_payment_transaction IS 
'Упрощённая логика: удаляет платёж и уменьшает авансовый баланс. Без отката распределения по активностям.';

-- ============================================
-- ШАГ 4: Удаляем старые advance_payment транзакции (опционально)
-- ============================================
-- Раскомментируй, если хочешь удалить все старые advance_payment транзакции
-- DELETE FROM public.finance_transactions WHERE type = 'advance_payment';

-- ============================================
-- Готово!
-- ============================================
-- Теперь логика упрощена:
-- 1. Платежи просто увеличивают advance_balances.balance
-- 2. Балансы по счетам считаются простой агрегацией (income - payment)
-- 3. Авансовый баланс показывается отдельно для предоплаты
-- 4. Карточка ребёнка показывает детализацию без автоматического распределения
