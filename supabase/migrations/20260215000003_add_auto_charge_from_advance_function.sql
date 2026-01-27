-- ============================================
-- Function to automatically charge from advance balance
-- Called when a new charge (income/expense) is created
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
