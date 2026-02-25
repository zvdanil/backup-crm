-- ============================================
-- Add allocation_activity_ids to finance_transactions
-- Optional: IDs of activities to allocate payment to (in priority order).
-- When set, payment is first applied to these activities; remainder auto-distributes.
-- ============================================

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS allocation_activity_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN public.finance_transactions.allocation_activity_ids IS 'Optional: activity IDs for targeted payment allocation (in order). Empty/null = free payment, auto-distributed by debt age and full-closure priority.';
