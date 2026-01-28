-- ============================================
-- Применить функцию rebuild_advance_distribution
-- Выполните этот скрипт в Supabase SQL Editor
-- ============================================

CREATE OR REPLACE FUNCTION public.rebuild_advance_distribution(
  p_student_id UUID,
  p_account_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_result JSON;
  v_total_payments INTEGER := 0;
  v_total_distributed DECIMAL(10,2) := 0;
  v_payments_recomputed INTEGER := 0;
  v_old_advance_balance DECIMAL(10,2) := 0;
  v_new_advance_balance DECIMAL(10,2) := 0;
BEGIN
  -- Get current advance balance
  SELECT COALESCE(balance, 0) INTO v_old_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  -- Delete all existing advance_payment transactions for this student/account
  DELETE FROM public.finance_transactions
  WHERE student_id = p_student_id
    AND account_id = p_account_id
    AND type = 'advance_payment';

  -- Reset advance balance to 0
  UPDATE public.advance_balances
  SET balance = 0,
      updated_at = now()
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  -- Re-run distribution for each payment in chronological order
  FOR v_payment IN
    SELECT id, amount, date
    FROM public.finance_transactions
    WHERE student_id = p_student_id
      AND account_id = p_account_id
      AND type = 'payment'
    ORDER BY date ASC, created_at ASC, id ASC
  LOOP
    v_total_payments := v_total_payments + 1;

    -- Call existing distribution function
    PERFORM distributed_amount, remaining_advance, payments_created
    FROM public.distribute_advance_payment(
      p_student_id,
      p_account_id,
      v_payment.amount
    );

    -- We can't easily accumulate distributed amount without changing
    -- distribute_advance_payment signature, so we'll recompute balance later
    v_payments_recomputed := v_payments_recomputed + 1;
  END LOOP;

  -- Get new advance balance
  SELECT COALESCE(balance, 0) INTO v_new_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  -- Prepare JSON result
  v_result := json_build_object(
    'student_id', p_student_id,
    'account_id', p_account_id,
    'old_advance_balance', v_old_advance_balance,
    'new_advance_balance', v_new_advance_balance,
    'payments_found', v_total_payments,
    'payments_recomputed', v_payments_recomputed
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rebuild_advance_distribution IS
'Полностью пересчитывает распределение авансов для конкретного ученика и счёта: удаляет advance_payment и заново выполняет distribute_advance_payment для всех платежей.';
