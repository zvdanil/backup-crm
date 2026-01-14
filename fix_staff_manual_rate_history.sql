-- ============================================
-- Apply staff_manual_rate_history migration
-- ============================================
-- Execute this script in Supabase SQL Editor to create the staff_manual_rate_history table

-- Create staff_manual_rate_history table (історія ставок для ручного режиму)
CREATE TABLE IF NOT EXISTS public.staff_manual_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    manual_rate_type VARCHAR(20) NOT NULL CHECK (manual_rate_type IN ('hourly', 'per_session')),
    manual_rate_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(staff_id, effective_from)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_manual_rate_history_staff_id ON public.staff_manual_rate_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_manual_rate_history_effective_from ON public.staff_manual_rate_history(effective_from);
CREATE INDEX IF NOT EXISTS idx_staff_manual_rate_history_effective_to ON public.staff_manual_rate_history(effective_to);

-- Enable RLS
ALTER TABLE public.staff_manual_rate_history ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Allow all access to staff_manual_rate_history" ON public.staff_manual_rate_history;
CREATE POLICY "Allow all access to staff_manual_rate_history" 
    ON public.staff_manual_rate_history 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Create trigger for updated_at (check if function exists first)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        DROP TRIGGER IF EXISTS update_staff_manual_rate_history_updated_at ON public.staff_manual_rate_history;
        CREATE TRIGGER update_staff_manual_rate_history_updated_at 
            BEFORE UPDATE ON public.staff_manual_rate_history 
            FOR EACH ROW 
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Migrate existing data from staff.manual_rate_type and staff.manual_rate_value
-- Only for staff with accrual_mode = 'manual'
INSERT INTO public.staff_manual_rate_history (staff_id, manual_rate_type, manual_rate_value, effective_from, effective_to)
SELECT 
    id,
    COALESCE(manual_rate_type, 'per_session')::VARCHAR(20),
    COALESCE(manual_rate_value, 0),
    CURRENT_DATE,
    NULL
FROM public.staff
WHERE accrual_mode = 'manual' 
  AND (manual_rate_type IS NOT NULL OR manual_rate_value IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_manual_rate_history 
    WHERE staff_manual_rate_history.staff_id = staff.id 
      AND staff_manual_rate_history.effective_from = CURRENT_DATE
  )
ON CONFLICT (staff_id, effective_from) DO NOTHING;
