-- Optional payout period marker for payroll payouts.
-- Stores target month as YYYY-MM (informational, not mandatory).

ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS payout_for_period text;

ALTER TABLE public.staff_payouts
  DROP CONSTRAINT IF EXISTS staff_payouts_payout_for_period_format_chk;

ALTER TABLE public.staff_payouts
  ADD CONSTRAINT staff_payouts_payout_for_period_format_chk
  CHECK (
    payout_for_period IS NULL
    OR payout_for_period ~ '^\d{4}-(0[1-9]|1[0-2])$'
  );

CREATE INDEX IF NOT EXISTS idx_staff_payouts_payout_for_period
ON public.staff_payouts(payout_for_period);

COMMENT ON COLUMN public.staff_payouts.payout_for_period IS
'Необовʼязкова ознака "виплата за період" у форматі YYYY-MM. Використовується для інформативного відображення.';
