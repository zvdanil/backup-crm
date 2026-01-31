-- ============================================
-- Применить миграции для per_working_day
-- Выполнить в Supabase SQL Editor
-- ============================================

-- Миграция 1: Добавить 'per_working_day' тип в staff_manual_rate_history
-- ============================================
ALTER TABLE public.staff_manual_rate_history
DROP CONSTRAINT IF EXISTS staff_manual_rate_history_manual_rate_type_check;

ALTER TABLE public.staff_manual_rate_history
ADD CONSTRAINT staff_manual_rate_history_manual_rate_type_check
CHECK (manual_rate_type IN ('hourly', 'per_session', 'per_working_day'));

-- Миграция 2: Добавить поля bonus и bonus_notes в staff_journal_entries
-- ============================================
ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS bonus DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS bonus_notes TEXT;

COMMENT ON COLUMN public.staff_journal_entries.bonus IS 'Bonus amount (can be negative) added to daily amount';
COMMENT ON COLUMN public.staff_journal_entries.bonus_notes IS 'Notes for bonus field';

-- Миграция 3: Создать таблицу holidays
-- ============================================
CREATE TABLE IF NOT EXISTS public.holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    name TEXT,
    is_recurring BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_recurring ON public.holidays(is_recurring);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to holidays" ON public.holidays;
CREATE POLICY "Allow all access to holidays" 
    ON public.holidays 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Создать функцию update_updated_at_column если её нет
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER update_holidays_updated_at 
    BEFORE UPDATE ON public.holidays 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- Вставить основные украинские праздники (повторяющиеся)
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

-- Миграция 4: Создать функцию для расчета рабочих дней с учетом праздников
-- ============================================
CREATE OR REPLACE FUNCTION public.get_working_days_in_month_with_holidays(
    year_val INTEGER,
    month_val INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    working_days INTEGER := 0;
    curr_date DATE;
    end_date DATE;
    day_of_week INTEGER;
    is_holiday BOOLEAN;
BEGIN
    curr_date := DATE(year_val, month_val, 1);
    end_date := (DATE(year_val, month_val, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    WHILE curr_date <= end_date LOOP
        day_of_week := EXTRACT(DOW FROM curr_date);
        
        -- Check if day is Monday (1) to Friday (5)
        IF day_of_week BETWEEN 1 AND 5 THEN
            -- Check if it's a holiday
            -- Check for exact date match
            SELECT EXISTS(
                SELECT 1 FROM public.holidays 
                WHERE date = curr_date
            ) INTO is_holiday;
            
            -- If not found, check for recurring holidays (same month and day, any year)
            IF NOT is_holiday THEN
                SELECT EXISTS(
                    SELECT 1 FROM public.holidays 
                    WHERE is_recurring = true
                    AND EXTRACT(MONTH FROM date) = month_val
                    AND EXTRACT(DAY FROM date) = EXTRACT(DAY FROM curr_date)
                ) INTO is_holiday;
            END IF;
            
            -- If not a holiday, count as working day
            IF NOT is_holiday THEN
                working_days := working_days + 1;
            END IF;
        END IF;
        
        curr_date := curr_date + INTERVAL '1 day';
    END LOOP;
    
    RETURN working_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Проверка успешного применения
SELECT 'Миграции успешно применены!' as status;
