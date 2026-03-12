-- Link finance_transactions to attendance for idempotent updates
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS attendance_id UUID
  REFERENCES public.attendance(id)
  ON DELETE SET NULL;

-- Fast lookup by attendance
CREATE INDEX IF NOT EXISTS idx_finance_transactions_attendance_id
  ON public.finance_transactions(attendance_id);

-- Ensure only one income transaction per attendance row
CREATE UNIQUE INDEX IF NOT EXISTS uniq_finance_transactions_attendance_income
  ON public.finance_transactions(attendance_id)
  WHERE attendance_id IS NOT NULL AND type = 'income';
