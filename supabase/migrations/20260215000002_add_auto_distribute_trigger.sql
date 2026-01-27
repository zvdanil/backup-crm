-- ============================================
-- Trigger to automatically distribute advance payment
-- Called when a payment transaction is created
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

-- Create trigger
DROP TRIGGER IF EXISTS on_payment_transaction_created ON public.finance_transactions;
CREATE TRIGGER on_payment_transaction_created
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payment_transaction();

COMMENT ON FUNCTION public.handle_payment_transaction() IS 
'Автоматически распределяет авансовый платёж при создании транзакции типа payment';
