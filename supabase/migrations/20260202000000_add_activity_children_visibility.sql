-- Add visibility flag for children activity selection
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS show_in_children boolean NOT NULL DEFAULT true;

-- Backfill existing records
UPDATE public.activities
SET show_in_children = true
WHERE show_in_children IS NULL;
