-- ============================================
-- Payment Accounts (Розрахункові рахунки)
-- ============================================

CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(name)
);

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_accounts_name ON public.payment_accounts(name);
CREATE INDEX IF NOT EXISTS idx_activities_account_id ON public.activities(account_id);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to payment_accounts" ON public.payment_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_payment_accounts_updated_at
    BEFORE UPDATE ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
