-- ============================================
-- Add account_id field to enrollments
-- Allows per-enrollment payment account assignment
-- ============================================

-- Add account_id column to enrollments
ALTER TABLE public.enrollments
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.enrollments.account_id IS 'Payment account for charges (рахунок для нарахувань). If NULL, uses account_id from activities table. Priority: enrollment.account_id > activity.account_id';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_enrollments_account_id ON public.enrollments(account_id);
