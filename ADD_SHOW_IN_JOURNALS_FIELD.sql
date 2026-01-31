-- Add show_in_journals field to activities table
-- This field controls whether activity is displayed in attendance journals

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS show_in_journals BOOLEAN DEFAULT true NOT NULL;

-- Update existing activities to have show_in_journals = true by default
UPDATE public.activities
SET show_in_journals = true
WHERE show_in_journals IS NULL;
