-- Add parent_name and child_name columns to user_profiles (for email/password registration)
-- This file is separate so migrate-to-railway.js does not skip it (the trigger file is skipped).
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS parent_name TEXT,
ADD COLUMN IF NOT EXISTS child_name TEXT;

COMMENT ON COLUMN public.user_profiles.parent_name IS 'ФІО батька (для реєстрації через email/password)';
COMMENT ON COLUMN public.user_profiles.child_name IS 'ФІО дитини (для реєстрації через email/password)';
