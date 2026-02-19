-- Add 'salary' to activity_category enum (used in Supabase, missing in migrations)
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'salary';
