-- Create holidays table for storing non-working days
-- This table is used to calculate working days excluding holidays

CREATE TABLE IF NOT EXISTS public.holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    name TEXT,
    is_recurring BOOLEAN DEFAULT false, -- If true, applies to this date every year
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for date lookups
CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_recurring ON public.holidays(is_recurring);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow all access to holidays" 
    ON public.holidays 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_holidays_updated_at 
    BEFORE UPDATE ON public.holidays 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert common Ukrainian holidays (recurring)
INSERT INTO public.holidays (date, name, is_recurring)
VALUES
    ('2024-01-01', 'Новий рік', true),
    ('2024-01-07', 'Різдво Христове', true),
    ('2024-03-08', 'Міжнародний жіночий день', true),
    ('2024-05-01', 'День праці', true),
    ('2024-05-09', 'День перемоги', true),
    ('2024-06-28', 'День Конституції', true),
    ('2024-08-24', 'День Незалежності', true),
    ('2024-10-14', 'День захисників України', true),
    ('2024-12-25', 'Різдво Христове', true)
ON CONFLICT (date) DO NOTHING;
