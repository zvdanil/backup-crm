-- ============================================
-- Add staff_payouts table (таблиця виплат зарплати)
-- ============================================

-- Create staff_payouts table
CREATE TABLE IF NOT EXISTS public.staff_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
    payout_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_payouts_staff_id ON public.staff_payouts(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_payout_date ON public.staff_payouts(payout_date);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_staff_date ON public.staff_payouts(staff_id, payout_date);

-- Enable RLS
ALTER TABLE public.staff_payouts ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow all access to staff_payouts" 
    ON public.staff_payouts 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_staff_payouts_updated_at 
    BEFORE UPDATE ON public.staff_payouts 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();
