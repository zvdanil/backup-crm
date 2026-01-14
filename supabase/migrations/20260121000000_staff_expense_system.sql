-- ============================================
-- Staff Expense System Migration
-- ============================================

-- 1. Add deductions column to staff table (для динамічних комісій)
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '[]';

-- 2. Create staff_billing_rules table (індивідуальні ставки персоналу)
CREATE TABLE IF NOT EXISTS public.staff_billing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
    rate_type VARCHAR(20) NOT NULL DEFAULT 'percent', -- 'fixed', 'percent', 'per_session'
    rate_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(staff_id, activity_id, effective_from)
);

-- 3. Create staff_journal_entries table (журнал витрат на персонал)
CREATE TABLE IF NOT EXISTS public.staff_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    base_amount DECIMAL(10,2), -- Базова сума до застосування комісій
    deductions_applied JSONB DEFAULT '[]', -- Масив застосованих комісій
    is_manual_override BOOLEAN DEFAULT false, -- Чи введено вручну
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(staff_id, activity_id, date) -- Один запис на день для пари staff-activity
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_billing_rules_staff_id ON public.staff_billing_rules(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_billing_rules_activity_id ON public.staff_billing_rules(activity_id);
CREATE INDEX IF NOT EXISTS idx_staff_billing_rules_effective_from ON public.staff_billing_rules(effective_from);
CREATE INDEX IF NOT EXISTS idx_staff_billing_rules_effective_to ON public.staff_billing_rules(effective_to);
CREATE INDEX IF NOT EXISTS idx_staff_journal_entries_staff_id ON public.staff_journal_entries(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_journal_entries_activity_id ON public.staff_journal_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_staff_journal_entries_date ON public.staff_journal_entries(date);

-- 5. Enable RLS
ALTER TABLE public.staff_billing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_journal_entries ENABLE ROW LEVEL SECURITY;

-- 6. Create policies
CREATE POLICY "Allow all access to staff_billing_rules" 
    ON public.staff_billing_rules 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow all access to staff_journal_entries" 
    ON public.staff_journal_entries 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 7. Create triggers for updated_at
CREATE TRIGGER update_staff_billing_rules_updated_at 
    BEFORE UPDATE ON public.staff_billing_rules 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_journal_entries_updated_at 
    BEFORE UPDATE ON public.staff_journal_entries 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();
