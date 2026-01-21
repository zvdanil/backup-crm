-- Add soft-delete fields for staff payouts
ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS deleted_note TEXT;
