-- Add activity_id to staff_manual_rate_history for per-activity manual rates
ALTER TABLE public.staff_manual_rate_history
ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_manual_rate_history_activity_id
  ON public.staff_manual_rate_history(activity_id);
