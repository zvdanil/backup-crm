-- ============================================
-- Исправить функцию distribute_advance_payment
-- Исправляет сравнение account_id (NULL handling)
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
  -- Validate input parameters
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'p_student_id cannot be NULL';
  END IF;
  
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'p_account_id cannot be NULL';
  END IF;
  
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be greater than 0';
  END IF;
  
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
        AND (
          -- Транзакции с правильным account_id
          ft.account_id IS NOT DISTINCT FROM ea.account_id
          -- ИЛИ старые транзакции с NULL account_id (если для enrollment/activity установлен account_id)
          OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
        )
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
