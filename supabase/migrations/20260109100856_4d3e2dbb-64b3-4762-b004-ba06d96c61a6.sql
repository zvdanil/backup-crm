-- Create enum for activity categories
CREATE TYPE public.activity_category AS ENUM ('income', 'expense', 'additional_income', 'household_expense');

-- Add category column to activities
ALTER TABLE public.activities 
ADD COLUMN category public.activity_category NOT NULL DEFAULT 'income';

-- Add effective_from to enrollments for price history
ALTER TABLE public.enrollments 
ADD COLUMN effective_from date DEFAULT CURRENT_DATE;