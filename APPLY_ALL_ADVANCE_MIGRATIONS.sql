-- ============================================
-- Применить все миграции для авансовых балансов
-- Выполнить в Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Добавить 'advance_payment' в enum transaction_type
-- ============================================
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'advance_payment';

-- ============================================
-- 2. Создать таблицу advance_balances
-- ============================================
CREATE TABLE IF NOT EXISTS public.advance_balances (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (student_id, account_id)
);

-- Добавить комментарии
COMMENT ON TABLE public.advance_balances IS 'Авансовые балансы для каждого ребёнка в разрезе финансовых счетов';
COMMENT ON COLUMN public.advance_balances.balance IS 'Текущий авансовый остаток (положительное число)';

-- Создать индексы
CREATE INDEX IF NOT EXISTS idx_advance_balances_student_id ON public.advance_balances(student_id);
CREATE INDEX IF NOT EXISTS idx_advance_balances_account_id ON public.advance_balances(account_id);

-- Включить RLS
ALTER TABLE public.advance_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to advance_balances" ON public.advance_balances;
CREATE POLICY "Allow all access to advance_balances" ON public.advance_balances FOR ALL USING (true) WITH CHECK (true);

-- Триггер для updated_at
DROP TRIGGER IF EXISTS update_advance_balances_updated_at ON public.advance_balances;
CREATE TRIGGER update_advance_balances_updated_at
  BEFORE UPDATE ON public.advance_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. Создать функцию distribute_advance_payment
-- ============================================
CREATE OR REPLACE FUNCTION public.distribute_advance_payment(
  p_student_id UUID,
  p_account_id UUID,
  p_amount DECIMAL(10,2)
)
RETURNS TABLE(
  distributed_amount DECIMAL(10,2),
  remaining_advance DECIMAL(10,2),
  payments_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance_balance DECIMAL(10,2) := 0;
  v_remaining_advance DECIMAL(10,2) := 0;
  v_distributed DECIMAL(10,2) := 0;
  v_payments_count INTEGER := 0;
  v_debt_record RECORD;
  v_payment_amount DECIMAL(10,2);
BEGIN
  -- Initialize or update advance balance
  INSERT INTO public.advance_balances (student_id, account_id, balance)
  VALUES (p_student_id, p_account_id, p_amount)
  ON CONFLICT (student_id, account_id)
  DO UPDATE SET 
    balance = advance_balances.balance + p_amount,
    updated_at = now();
  
  -- Get current advance balance
  SELECT balance INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id AND account_id = p_account_id;
  
  -- If no advance balance, return early
  IF v_advance_balance <= 0 THEN
    RETURN QUERY SELECT 0::DECIMAL(10,2), 0::DECIMAL(10,2), 0;
    RETURN;
  END IF;
  
  v_remaining_advance := v_advance_balance;
  
  -- Find all enrollments for this student with debts on this account
  -- Calculate balance for each enrollment (charges - payments)
  FOR v_debt_record IN
    WITH enrollment_accounts AS (
      -- Get account_id for each enrollment (enrollment.account_id ?? activity.account_id)
      SELECT 
        e.id AS enrollment_id,
        e.student_id,
        e.activity_id,
        COALESCE(e.account_id, a.account_id) AS account_id
      FROM public.enrollments e
      INNER JOIN public.activities a ON e.activity_id = a.id
      WHERE e.student_id = p_student_id
        AND e.is_active = true
        AND COALESCE(e.account_id, a.account_id) = p_account_id
    ),
    enrollment_balances AS (
      -- Calculate balance for each enrollment
      -- Balance formula: charges (income) - payments (payment + advance_payment) + refunds (expense)
      -- Debt = charges - payments - refunds (negative balance)
      SELECT 
        ea.enrollment_id,
        ea.activity_id,
        ea.account_id,
        COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS charges,
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds,
        COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS balance
      FROM enrollment_accounts ea
      LEFT JOIN public.finance_transactions ft ON 
        ft.student_id = ea.student_id 
        AND ft.activity_id = ea.activity_id
        AND COALESCE(ft.account_id, 'NULL') = COALESCE(ea.account_id, 'NULL')
      GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id
      HAVING COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) - 
             COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) > 0
    )
    SELECT 
      eb.enrollment_id,
      eb.activity_id,
      eb.balance AS debt_amount
    FROM enrollment_balances eb
    ORDER BY eb.balance DESC -- Sort by debt amount (largest first)
  LOOP
    -- If no remaining advance, stop
    IF v_remaining_advance <= 0 THEN
      EXIT;
    END IF;
    
    -- Calculate payment amount (full debt or remaining advance, whichever is smaller)
    v_payment_amount := LEAST(v_debt_record.debt_amount, v_remaining_advance);
    
    -- Create advance_payment transaction
    INSERT INTO public.finance_transactions (
      type,
      student_id,
      activity_id,
      account_id,
      amount,
      date,
      description
    ) VALUES (
      'advance_payment',
      p_student_id,
      v_debt_record.activity_id,
      p_account_id,
      v_payment_amount,
      CURRENT_DATE,
      'Автоматичне погашення з авансового рахунку'
    );
    
    v_payments_count := v_payments_count + 1;
    v_distributed := v_distributed + v_payment_amount;
    v_remaining_advance := v_remaining_advance - v_payment_amount;
  END LOOP;
  
  -- Update advance balance with remaining amount
  UPDATE public.advance_balances
  SET balance = v_remaining_advance,
      updated_at = now()
  WHERE student_id = p_student_id AND account_id = p_account_id;
  
  -- Return results
  RETURN QUERY SELECT v_distributed, v_remaining_advance, v_payments_count;
END;
$$;

COMMENT ON FUNCTION public.distribute_advance_payment IS 
'Распределяет авансовый платёж по задолженностям (Waterfall алгоритм). Гасит долги от самого большого к самому маленькому.';

-- ============================================
-- 4. Создать триггер для автоматического распределения
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_payment_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process 'payment' type transactions with student_id and account_id
  IF NEW.type = 'payment' AND NEW.student_id IS NOT NULL AND NEW.account_id IS NOT NULL THEN
    -- Call distribution function
    PERFORM public.distribute_advance_payment(
      NEW.student_id,
      NEW.account_id,
      NEW.amount
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_payment_transaction() IS 
'Автоматически распределяет авансовый платёж при создании транзакции типа payment';

-- Создать триггер
DROP TRIGGER IF EXISTS on_payment_transaction_created ON public.finance_transactions;
CREATE TRIGGER on_payment_transaction_created
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payment_transaction();

-- ============================================
-- 5. Создать функцию auto_charge_from_advance
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_charge_from_advance(
  p_student_id UUID,
  p_account_id UUID,
  p_activity_id UUID,
  p_charge_amount DECIMAL(10,2)
)
RETURNS DECIMAL(10,2) -- Returns remaining debt after auto-payment
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance_balance DECIMAL(10,2) := 0;
  v_payment_amount DECIMAL(10,2) := 0;
  v_remaining_debt DECIMAL(10,2) := 0;
BEGIN
  -- Get advance balance (handle NULL - if no record exists, balance is 0)
  SELECT COALESCE(balance, 0) INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id AND account_id = p_account_id;
  
  -- If no advance balance, return full charge amount as debt
  IF v_advance_balance <= 0 THEN
    RETURN p_charge_amount;
  END IF;
  
  -- Calculate payment amount (full charge or remaining advance, whichever is smaller)
  v_payment_amount := LEAST(p_charge_amount, v_advance_balance);
  v_remaining_debt := p_charge_amount - v_payment_amount;
  
  -- Create advance_payment transaction if we can pay something
  IF v_payment_amount > 0 THEN
    INSERT INTO public.finance_transactions (
      type,
      student_id,
      activity_id,
      account_id,
      amount,
      date,
      description
    ) VALUES (
      'advance_payment',
      p_student_id,
      p_activity_id,
      p_account_id,
      v_payment_amount,
      CURRENT_DATE,
      'Автоматичне списання з авансового рахунку'
    );
    
    -- Update advance balance
    UPDATE public.advance_balances
    SET balance = balance - v_payment_amount,
        updated_at = now()
    WHERE student_id = p_student_id AND account_id = p_account_id;
  END IF;
  
  -- Return remaining debt
  RETURN v_remaining_debt;
END;
$$;

COMMENT ON FUNCTION public.auto_charge_from_advance IS 
'Автоматически списывает средства с авансового баланса при создании нового начисления. Возвращает остаток долга после списания.';

-- ============================================
-- Проверка: убедиться, что все создано правильно
-- ============================================
-- Проверить enum
SELECT unnest(enum_range(NULL::public.transaction_type)) AS transaction_type;

-- Проверить таблицу
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'advance_balances' 
AND table_schema = 'public';

-- Проверить функции
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('distribute_advance_payment', 'handle_payment_transaction', 'auto_charge_from_advance');

-- Проверить триггер
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_payment_transaction_created';
