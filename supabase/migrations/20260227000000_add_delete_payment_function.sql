-- ============================================
-- Function to delete payment transaction and rollback distribution
-- Deletes advance_payment transactions and decreases advance balance
-- ============================================

-- Drop existing function if it exists (to change return type)
DROP FUNCTION IF EXISTS public.delete_payment_transaction(UUID, TEXT);

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
  
  -- Handle old payments without account_id or student_id
  -- If account_id is NULL, we can't rollback distribution, so just delete the payment
  IF v_payment_record.student_id IS NULL OR v_payment_record.account_id IS NULL THEN
    -- For old payments without account_id/student_id, just delete the payment
    -- No distribution rollback is possible
    DELETE FROM public.finance_transactions
    WHERE id = p_transaction_id;
    
    -- Return minimal result
    v_result := json_build_object(
      'deleted_payment_amount', v_payment_record.amount::numeric,
      'deleted_advance_payments_count', 0,
      'deleted_advance_payments_amount', 0::numeric,
      'remaining_advance_balance', 0::numeric,
      'note', 'Old payment without account_id/student_id - no distribution rollback performed'
    );
    
    RETURN v_result;
  END IF;
  
  -- Find and delete all advance_payment transactions created for this payment
  -- They should have the same student_id, account_id, and date >= payment date
  -- Note: There are two possible descriptions:
  --   - 'Автоматичне погашення з авансового рахунку' (from distribute_advance_payment)
  --   - 'Автоматичне списання з авансового рахунку' (from auto_charge_from_advance)
  WITH deleted_advance_payments AS (
    DELETE FROM public.finance_transactions
    WHERE type = 'advance_payment'
      AND student_id = v_payment_record.student_id
      AND account_id = v_payment_record.account_id
      AND date >= v_payment_record.date
      AND description IN (
        'Автоматичне погашення з авансового рахунку',
        'Автоматичне списання з авансового рахунку'
      )
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
  -- Use INSERT ... ON CONFLICT to handle case when advance_balance doesn't exist
  INSERT INTO public.advance_balances (student_id, account_id, balance)
  VALUES (
    v_payment_record.student_id,
    v_payment_record.account_id,
    GREATEST(0, 0 - v_payment_record.amount + v_advance_payments_amount)
  )
  ON CONFLICT (student_id, account_id)
  DO UPDATE SET 
    balance = GREATEST(0, advance_balances.balance - v_payment_record.amount + v_advance_payments_amount),
    updated_at = now();
  
  -- Get remaining advance balance
  SELECT balance INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = v_payment_record.student_id
    AND account_id = v_payment_record.account_id;
  
  -- Delete the payment transaction itself
  DELETE FROM public.finance_transactions
  WHERE id = p_transaction_id;
  
  -- Return results as JSON
  -- Use explicit type casting to ensure proper JSON format
  v_result := json_build_object(
    'deleted_payment_amount', v_payment_record.amount::numeric,
    'deleted_advance_payments_count', v_advance_payments_count,
    'deleted_advance_payments_amount', v_advance_payments_amount::numeric,
    'remaining_advance_balance', COALESCE(v_advance_balance, 0)::numeric
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error details and re-raise with context
    RAISE EXCEPTION 'Error in delete_payment_transaction: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_payment_transaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment_transaction(UUID, TEXT) TO anon;

COMMENT ON FUNCTION public.delete_payment_transaction IS 
'Удаляет платёж и откатывает распределение: удаляет advance_payment транзакции и уменьшает авансовый баланс';
