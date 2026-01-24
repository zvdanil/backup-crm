-- ============================================
-- Add payment details field to payment_accounts
-- ============================================

-- Add details column to payment_accounts
ALTER TABLE public.payment_accounts
ADD COLUMN IF NOT EXISTS details TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.payment_accounts.details IS 'Payment details (реквізити) - банковские реквизиты для оплаты, отображаются в кабинете родителей';
