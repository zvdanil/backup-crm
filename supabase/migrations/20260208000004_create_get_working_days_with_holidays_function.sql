-- Create function to calculate working days in a month excluding holidays
-- Working days = Monday-Friday, excluding holidays from holidays table

CREATE OR REPLACE FUNCTION public.get_working_days_in_month_with_holidays(
    year_val INTEGER,
    month_val INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    working_days INTEGER := 0;
    current_date DATE;
    end_date DATE;
    day_of_week INTEGER;
    is_holiday BOOLEAN;
BEGIN
    current_date := DATE(year_val, month_val, 1);
    end_date := (DATE(year_val, month_val, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    WHILE current_date <= end_date LOOP
        day_of_week := EXTRACT(DOW FROM current_date);
        
        -- Check if day is Monday (1) to Friday (5)
        IF day_of_week BETWEEN 1 AND 5 THEN
            -- Check if it's a holiday
            -- Check for exact date match
            SELECT EXISTS(
                SELECT 1 FROM public.holidays 
                WHERE date = current_date
            ) INTO is_holiday;
            
            -- If not found, check for recurring holidays (same month and day, any year)
            IF NOT is_holiday THEN
                SELECT EXISTS(
                    SELECT 1 FROM public.holidays 
                    WHERE is_recurring = true
                    AND EXTRACT(MONTH FROM date) = month_val
                    AND EXTRACT(DAY FROM date) = EXTRACT(DAY FROM current_date)
                ) INTO is_holiday;
            END IF;
            
            -- If not a holiday, count as working day
            IF NOT is_holiday THEN
                working_days := working_days + 1;
            END IF;
        END IF;
        
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
    
    RETURN working_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
