-- ============================================
-- Dynamic Billing System Migration
-- ============================================

-- 1. Add billing_rules column to activities table
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS billing_rules JSONB DEFAULT '{}';

-- 2. Create activity_price_history table
CREATE TABLE IF NOT EXISTS public.activity_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    billing_rules JSONB NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Add manual_value_edit column to attendance table
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS manual_value_edit BOOLEAN DEFAULT false;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_price_history_activity_id ON public.activity_price_history(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_price_history_effective_from ON public.activity_price_history(effective_from);
CREATE INDEX IF NOT EXISTS idx_activity_price_history_effective_to ON public.activity_price_history(effective_to);

-- 5. Enable RLS for activity_price_history
ALTER TABLE public.activity_price_history ENABLE ROW LEVEL SECURITY;

-- 6. Create policy for activity_price_history
CREATE POLICY "Allow all access to activity_price_history" 
    ON public.activity_price_history 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 7. Create trigger for updated_at on activity_price_history
CREATE TRIGGER update_activity_price_history_updated_at 
    BEFORE UPDATE ON public.activity_price_history 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Function to get working days count in a month (Monday-Friday)
CREATE OR REPLACE FUNCTION public.get_working_days_in_month(year_val INTEGER, month_val INTEGER)
RETURNS INTEGER AS $$
DECLARE
    working_days INTEGER := 0;
    current_date DATE;
    end_date DATE;
BEGIN
    current_date := DATE(year_val, month_val, 1);
    end_date := (DATE(year_val, month_val, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    WHILE current_date <= end_date LOOP
        -- Check if day is Monday (1) to Friday (5)
        IF EXTRACT(DOW FROM current_date) BETWEEN 1 AND 5 THEN
            working_days := working_days + 1;
        END IF;
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
    
    RETURN working_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
