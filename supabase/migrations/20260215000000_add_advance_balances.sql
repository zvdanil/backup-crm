-- ============================================
-- Add advance balances table and advance_payment transaction type
-- Implements "Advance Account -> Distribution" model
-- ============================================

-- 1. Add 'advance_payment' to transaction_type enum
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'advance_payment';

-- 2. Create advance_balances table
CREATE TABLE IF NOT EXISTS public.advance_balances (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (student_id, account_id)
);

-- Add comments
COMMENT ON TABLE public.advance_balances IS 'Авансовые балансы для каждого ребёнка в разрезе финансовых счетов';
COMMENT ON COLUMN public.advance_balances.balance IS 'Текущий авансовый остаток (положительное число)';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_advance_balances_student_id ON public.advance_balances(student_id);
CREATE INDEX IF NOT EXISTS idx_advance_balances_account_id ON public.advance_balances(account_id);

-- Enable RLS
ALTER TABLE public.advance_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to advance_balances" ON public.advance_balances FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_advance_balances_updated_at
  BEFORE UPDATE ON public.advance_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
