-- ============================================
-- Add account_transfers table for transfers between accounts
-- ============================================

-- Create account_transfers table
CREATE TABLE IF NOT EXISTS public.account_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  
  -- Ensure from and to accounts are different
  CONSTRAINT account_transfers_different_accounts CHECK (from_account_id != to_account_id)
);

COMMENT ON TABLE public.account_transfers IS 'Transfers of funds between payment accounts. Creates two finance_transactions: expense from source account and payment to destination account.';

COMMENT ON COLUMN public.account_transfers.from_account_id IS 'Source account (money is transferred FROM this account)';
COMMENT ON COLUMN public.account_transfers.to_account_id IS 'Destination account (money is transferred TO this account)';
COMMENT ON COLUMN public.account_transfers.amount IS 'Transfer amount (must be positive)';
COMMENT ON COLUMN public.account_transfers.transfer_date IS 'Date of the transfer';
COMMENT ON COLUMN public.account_transfers.description IS 'Optional description/comment for the transfer';
COMMENT ON COLUMN public.account_transfers.is_cancelled IS 'If true, the transfer has been cancelled';
COMMENT ON COLUMN public.account_transfers.cancelled_at IS 'Timestamp when the transfer was cancelled';
COMMENT ON COLUMN public.account_transfers.cancelled_by IS 'User who cancelled the transfer';
COMMENT ON COLUMN public.account_transfers.cancellation_reason IS 'Optional reason for cancellation';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_account_transfers_from_account_id ON public.account_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to_account_id ON public.account_transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_transfer_date ON public.account_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_account_transfers_is_cancelled ON public.account_transfers(is_cancelled);

-- Add transfer_id column to finance_transactions to link transactions created by transfers
ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.account_transfers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.finance_transactions.transfer_id IS 'Links finance_transaction to account_transfer. Used for transfer operations: expense from source account and payment to destination account.';

CREATE INDEX IF NOT EXISTS idx_finance_transactions_transfer_id ON public.finance_transactions(transfer_id);

-- Function to create transfer (creates two finance_transactions)
CREATE OR REPLACE FUNCTION public.create_account_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount DECIMAL(10, 2),
  p_transfer_date DATE,
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  v_transfer_id UUID;
  v_expense_transaction_id UUID;
  v_payment_transaction_id UUID;
BEGIN
  -- Validate that accounts are different
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  -- Create transfer record
  INSERT INTO public.account_transfers (
    from_account_id,
    to_account_id,
    amount,
    transfer_date,
    description,
    created_by
  )
  VALUES (
    p_from_account_id,
    p_to_account_id,
    p_amount,
    p_transfer_date,
    p_description,
    p_created_by
  )
  RETURNING id INTO v_transfer_id;

  -- Create expense transaction (money out from source account)
  -- ВАЖНО: создаем expense транзакцию ПЕРВОЙ, чтобы если она не создастся, payment тоже не создастся
  INSERT INTO public.finance_transactions (
    type,
    account_id,
    amount,
    date,
    description,
    transfer_id
  )
  VALUES (
    'expense',
    p_from_account_id,
    p_amount,
    p_transfer_date,
    COALESCE(p_description, 'Переказ з рахунку') || ' (ID: ' || v_transfer_id::TEXT || ')',
    v_transfer_id
  )
  RETURNING id INTO v_expense_transaction_id;

  -- Verify expense transaction was created - если не создалась, откатываем все
  IF v_expense_transaction_id IS NULL THEN
    DELETE FROM public.account_transfers WHERE id = v_transfer_id;
    RAISE EXCEPTION 'Failed to create expense transaction: transaction ID is NULL';
  END IF;

  -- Create payment transaction (money in to destination account)
  INSERT INTO public.finance_transactions (
    type,
    account_id,
    amount,
    date,
    description,
    transfer_id
  )
  VALUES (
    'payment',
    p_to_account_id,
    p_amount,
    p_transfer_date,
    COALESCE(p_description, 'Переказ на рахунок') || ' (ID: ' || v_transfer_id::TEXT || ')',
    v_transfer_id
  )
  RETURNING id INTO v_payment_transaction_id;

  -- Verify payment transaction was created
  IF v_payment_transaction_id IS NULL THEN
    -- Rollback: delete expense transaction and transfer
    DELETE FROM public.finance_transactions WHERE id = v_expense_transaction_id;
    DELETE FROM public.account_transfers WHERE id = v_transfer_id;
    RAISE EXCEPTION 'Failed to create payment transaction: transaction ID is NULL';
  END IF;

  RETURN v_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.create_account_transfer IS 'Creates an account transfer and two associated finance_transactions (expense from source, payment to destination)';

-- Function to cancel transfer (marks as cancelled and deletes associated finance_transactions)
CREATE OR REPLACE FUNCTION public.cancel_account_transfer(
  p_transfer_id UUID,
  p_cancelled_by UUID DEFAULT NULL,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if transfer exists and is not already cancelled
  IF NOT EXISTS (SELECT 1 FROM public.account_transfers WHERE id = p_transfer_id) THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.account_transfers WHERE id = p_transfer_id AND is_cancelled = true) THEN
    RAISE EXCEPTION 'Transfer is already cancelled';
  END IF;

  -- Mark transfer as cancelled
  UPDATE public.account_transfers
  SET 
    is_cancelled = true,
    cancelled_at = NOW(),
    cancelled_by = p_cancelled_by,
    cancellation_reason = p_cancellation_reason
  WHERE id = p_transfer_id;

  -- Delete associated finance_transactions
  DELETE FROM public.finance_transactions
  WHERE transfer_id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_account_transfer IS 'Cancels an account transfer and deletes associated finance_transactions';

-- Enable RLS on account_transfers
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all access to account_transfers (same as finance_transactions)
-- Drop policy if exists to avoid errors on re-run
DROP POLICY IF EXISTS "Allow all access to account_transfers" ON public.account_transfers;
CREATE POLICY "Allow all access to account_transfers" ON public.account_transfers FOR ALL USING (true) WITH CHECK (true);
