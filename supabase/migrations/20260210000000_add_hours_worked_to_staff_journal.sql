-- ============================================
-- Add hours_worked field to staff_journal_entries
-- For hourly rate tracking
-- ============================================

-- Add hours_worked column to staff_journal_entries
ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(5,2);

-- Add comment to explain the field
COMMENT ON COLUMN public.staff_journal_entries.hours_worked IS 'Number of hours worked (for hourly rate calculations). NULL for non-hourly rates.';
