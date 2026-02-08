-- ============================================
-- Simplified function to delete payment transaction
-- Does NOT use advance_balances table
-- Just deletes the payment transaction
-- ============================================

-- Drop existing function if it exists
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
  
  -- Simply delete the payment transaction
  -- No complex distribution rollback needed
  DELETE FROM public.finance_transactions
  WHERE id = p_transaction_id;
  
  -- Return minimal result
  v_result := json_build_object(
    'deleted_payment_amount', v_payment_record.amount::numeric,
    'deleted_advance_payments_count', 0,
    'deleted_advance_payments_amount', 0::numeric,
    'remaining_advance_balance', 0::numeric,
    'note', 'Payment deleted successfully'
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
'Упрощённая версия: удаляет платёж без работы с авансовыми балансами';
