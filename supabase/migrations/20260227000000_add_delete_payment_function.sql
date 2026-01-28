-- ============================================
-- Function to delete payment transaction and rollback distribution
-- Deletes advance_payment transactions and decreases advance balance
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
  v_advance_payments_amount DECIMAL(10,2) := 0;
  v_advance_payments_count INTEGER := 0;
  v_advance_balance DECIMAL(10,2) := 0;
  v_result JSON;
BEGIN
  -- Get payment transaction details
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
  
  IF v_payment_record.student_id IS NULL OR v_payment_record.account_id IS NULL THEN
    RAISE EXCEPTION 'Payment transaction must have student_id and account_id';
  END IF;
  
  -- Find and delete all advance_payment transactions created for this payment
  -- They should have the same student_id, account_id, and date >= payment date
  WITH deleted_advance_payments AS (
    DELETE FROM public.finance_transactions
    WHERE type = 'advance_payment'
      AND student_id = v_payment_record.student_id
      AND account_id = v_payment_record.account_id
      AND date >= v_payment_record.date
      AND description = 'Автоматичне погашення з авансового рахунку'
    RETURNING amount
  )
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount), 0)
  INTO v_advance_payments_count, v_advance_payments_amount
  FROM deleted_advance_payments;
  
  -- Decrease advance balance by payment amount
  -- If advance_payments were deleted, we need to add them back to advance balance
  -- Then subtract the payment amount
  UPDATE public.advance_balances
  SET 
    balance = GREATEST(0, balance - v_payment_record.amount + v_advance_payments_amount),
    updated_at = now()
  WHERE student_id = v_payment_record.student_id
    AND account_id = v_payment_record.account_id;
  
  -- Get remaining advance balance
  SELECT balance INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = v_payment_record.student_id
    AND account_id = v_payment_record.account_id;
  
  -- Delete the payment transaction itself
  DELETE FROM public.finance_transactions
  WHERE id = p_transaction_id;
  
  -- Return results as JSON
  v_result := json_build_object(
    'deleted_payment_amount', v_payment_record.amount,
    'deleted_advance_payments_count', v_advance_payments_count,
    'deleted_advance_payments_amount', v_advance_payments_amount,
    'remaining_advance_balance', COALESCE(v_advance_balance, 0)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.delete_payment_transaction IS 
'Удаляет платёж и откатывает распределение: удаляет advance_payment транзакции и уменьшает авансовый баланс';
