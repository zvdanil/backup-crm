-- Add bonus field to staff_journal_entries
-- Bonus can be positive or negative and is added to the daily amount

ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS bonus DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS bonus_notes TEXT;

-- Add comment
COMMENT ON COLUMN public.staff_journal_entries.bonus IS 'Bonus amount (can be negative) added to daily amount';
COMMENT ON COLUMN public.staff_journal_entries.bonus_notes IS 'Notes for bonus field';
