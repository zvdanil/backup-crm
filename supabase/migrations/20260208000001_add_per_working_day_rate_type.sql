-- Add 'per_working_day' type to staff_manual_rate_history
-- This allows staff to have monthly rates that are divided by working days

-- Update CHECK constraint to include 'per_working_day'
ALTER TABLE public.staff_manual_rate_history
DROP CONSTRAINT IF EXISTS staff_manual_rate_history_manual_rate_type_check;

ALTER TABLE public.staff_manual_rate_history
ADD CONSTRAINT staff_manual_rate_history_manual_rate_type_check
CHECK (manual_rate_type IN ('hourly', 'per_session', 'per_working_day'));
