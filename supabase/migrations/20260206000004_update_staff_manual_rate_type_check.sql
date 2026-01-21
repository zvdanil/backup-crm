-- Allow hourly and per_session manual rate types
ALTER TABLE public.staff_manual_rate_history
DROP CONSTRAINT IF EXISTS staff_manual_rate_history_manual_rate_type_check;

ALTER TABLE public.staff_manual_rate_history
ADD CONSTRAINT staff_manual_rate_history_manual_rate_type_check
CHECK (manual_rate_type IN ('hourly', 'per_session'));
