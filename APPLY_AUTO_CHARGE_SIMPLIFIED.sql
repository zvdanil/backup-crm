-- ============================================
-- Применить упрощённую функцию автоматического списания с авансового баланса
-- Выполнить в Supabase SQL Editor
-- ============================================

-- ============================================
-- Упрощённая функция автоматического списания с авансового баланса
-- Вызывается при создании income/expense транзакций
-- Без создания advance_payment транзакций, просто уменьшает авансовый баланс
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_charge_from_advance_simplified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance_balance DECIMAL(10,2) := 0;
  v_payment_amount DECIMAL(10,2) := 0;
BEGIN
  -- Обрабатываем только income и expense транзакции для студентов с account_id
  IF (NEW.type = 'income' OR NEW.type = 'expense')
     AND NEW.student_id IS NOT NULL 
     AND NEW.account_id IS NOT NULL 
     AND NEW.amount > 0 THEN
    
    -- Получаем текущий авансовый баланс
    SELECT COALESCE(balance, 0) INTO v_advance_balance
    FROM public.advance_balances
    WHERE student_id = NEW.student_id 
      AND account_id = NEW.account_id;
    
    -- Если есть авансовый баланс, списываем с него
    IF v_advance_balance > 0 THEN
      -- Для expense (возвраты) увеличиваем авансовый баланс
      IF NEW.type = 'expense' THEN
        UPDATE public.advance_balances
        SET balance = balance + NEW.amount,
            updated_at = now()
        WHERE student_id = NEW.student_id 
          AND account_id = NEW.account_id;
      ELSE
        -- Для income (начисления) уменьшаем авансовый баланс
        -- Списываем либо всю сумму начисления, либо весь авансовый баланс (что меньше)
        v_payment_amount := LEAST(NEW.amount, v_advance_balance);
        
        UPDATE public.advance_balances
        SET balance = GREATEST(0, balance - v_payment_amount),
            updated_at = now()
        WHERE student_id = NEW.student_id 
          AND account_id = NEW.account_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_charge_from_advance_simplified() IS 
'Упрощённая логика: автоматически списывает с авансового баланса при создании income транзакций и увеличивает при expense (возвратах). Без создания advance_payment транзакций.';

-- Создаём триггер
DROP TRIGGER IF EXISTS on_charge_transaction_created ON public.finance_transactions;
CREATE TRIGGER on_charge_transaction_created
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_charge_from_advance_simplified();

COMMENT ON TRIGGER on_charge_transaction_created ON public.finance_transactions IS 
'Автоматически списывает с авансового баланса при создании income/expense транзакций.';

-- ============================================
-- Функция для пересчёта существующих начислений и списания с авансового баланса
-- Можно вызвать вручную для пересчёта существующих транзакций
-- ============================================

CREATE OR REPLACE FUNCTION public.recalculate_advance_balance_for_student(
  p_student_id UUID,
  p_account_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance_balance DECIMAL(10,2) := 0;
  v_total_income DECIMAL(10,2) := 0;
  v_total_expense DECIMAL(10,2) := 0;
  v_charge_amount DECIMAL(10,2) := 0;
  v_last_payment_date DATE;
  v_charged_amount DECIMAL(10,2) := 0;
  v_advance_before DECIMAL(10,2) := 0;
  v_result JSON;
BEGIN
  -- Получаем текущий авансовый баланс
  SELECT COALESCE(balance, 0) INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id 
    AND account_id = p_account_id;
  
  -- Если нет авансового баланса, ничего не делаем
  IF v_advance_balance <= 0 THEN
    RETURN json_build_object(
      'message', 'No advance balance to recalculate',
      'advance_balance', 0::numeric,
      'total_income', 0::numeric,
      'total_expense', 0::numeric
    );
  END IF;
  
  -- Находим дату последнего платежа для этого студента и счёта
  SELECT MAX(date) INTO v_last_payment_date
  FROM public.finance_transactions
  WHERE student_id = p_student_id
    AND account_id = p_account_id
    AND type = 'payment'
    AND amount > 0;
  
  -- Если платежей не было, ничего не делаем
  IF v_last_payment_date IS NULL THEN
    RETURN json_build_object(
      'message', 'No payments found for this student and account',
      'advance_balance', v_advance_balance::numeric
    );
  END IF;
  
  -- Считаем сумму всех income транзакций, созданных после последнего платежа
  SELECT COALESCE(SUM(amount), 0) INTO v_total_income
  FROM public.finance_transactions
  WHERE student_id = p_student_id
    AND account_id = p_account_id
    AND type = 'income'
    AND amount > 0
    AND date >= v_last_payment_date;
  
  -- Считаем сумму всех expense транзакций (возвратов), созданных после последнего платежа
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expense
  FROM public.finance_transactions
  WHERE student_id = p_student_id
    AND account_id = p_account_id
    AND type = 'expense'
    AND amount > 0
    AND date >= v_last_payment_date;
  
  -- Чистая сумма начислений (income - expense)
  v_charge_amount := v_total_income - v_total_expense;
  
  -- Сохраняем начальный авансовый баланс ДО списания
  v_advance_before := v_advance_balance;
  
  -- Если есть начисления, списываем с авансового баланса
  IF v_charge_amount > 0 THEN
    -- Сохраняем сумму списанного с авансового баланса
    v_charged_amount := LEAST(v_charge_amount, v_advance_balance);
    
    -- Списываем либо всю сумму начислений, либо весь авансовый баланс (что меньше)
    UPDATE public.advance_balances
    SET balance = GREATEST(0, balance - LEAST(v_charge_amount, v_advance_balance)),
        updated_at = now()
    WHERE student_id = p_student_id 
      AND account_id = p_account_id;
  ELSE
    -- Если нет начислений, устанавливаем значения в 0
    v_charged_amount := 0;
  END IF;
  
  -- Получаем обновлённый авансовый баланс
  SELECT COALESCE(balance, 0) INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id 
    AND account_id = p_account_id;
  
  -- Возвращаем результат
  v_result := json_build_object(
    'message', 'Advance balance recalculated',
    'advance_balance_before', v_advance_before::numeric,
    'advance_balance_after', v_advance_balance::numeric,
    'total_income', v_total_income::numeric,
    'total_expense', v_total_expense::numeric,
    'charge_amount', v_charge_amount::numeric,
    'charged_from_advance', v_charged_amount::numeric
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.recalculate_advance_balance_for_student IS 
'Пересчитывает авансовый баланс для существующих income/expense транзакций. Списывает с авансового баланса сумму всех начислений (income - expense).';

-- ============================================
-- Готово!
-- ============================================
-- Теперь при создании income транзакций авансовый баланс будет автоматически уменьшаться.
-- При создании expense транзакций (возвратов) авансовый баланс будет увеличиваться.
-- 
-- Для пересчёта существующих начислений можно вызвать:
-- SELECT public.recalculate_advance_balance_for_student('student_id', 'account_id');
