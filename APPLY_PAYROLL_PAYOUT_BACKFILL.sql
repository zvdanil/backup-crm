-- ============================================
-- STEP 11: payroll payouts backfill (apply)
-- Canonical source: staff_payouts
-- Rules:
-- - Auto-link only unique matches (staff_id + date + amount)
-- - Ambiguous matches are skipped (manual review required)
-- - If no candidate tx exists, create derived salary tx
-- - Backfill subcategory in canonical payouts from linked tx when missing
-- ============================================

BEGIN;

-- Safety: ensure canonical subcategory column exists.
ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS expense_category_id UUID
REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_payouts_expense_category_id
ON public.staff_payouts(expense_category_id);

-- 1) Link unique existing salary transactions to payouts
WITH missing_links AS (
  SELECT
    sp.id AS payout_id,
    sp.staff_id,
    sp.payout_date,
    sp.amount
  FROM public.staff_payouts sp
  LEFT JOIN public.finance_transactions tx
    ON tx.staff_payout_id = sp.id
   AND tx.type = 'salary'
  WHERE COALESCE(sp.is_deleted, false) = false
    AND tx.id IS NULL
),
candidates AS (
  SELECT
    ml.payout_id,
    COUNT(tx.id) AS candidate_count,
    (ARRAY_REMOVE(ARRAY_AGG(tx.id), NULL))[1] AS unique_tx_id
  FROM missing_links ml
  LEFT JOIN public.finance_transactions tx
    ON tx.type = 'salary'
   AND tx.staff_payout_id IS NULL
   AND tx.staff_id = ml.staff_id
   AND tx.date = ml.payout_date
   AND tx.amount = ml.amount
  GROUP BY ml.payout_id
)
UPDATE public.finance_transactions tx
SET staff_payout_id = c.payout_id
FROM candidates c
WHERE c.candidate_count = 1
  AND tx.id = c.unique_tx_id;

-- 2) Create missing derived salary transactions for payouts with no candidates
WITH missing_links AS (
  SELECT
    sp.*
  FROM public.staff_payouts sp
  LEFT JOIN public.finance_transactions tx
    ON tx.staff_payout_id = sp.id
   AND tx.type = 'salary'
  WHERE COALESCE(sp.is_deleted, false) = false
    AND tx.id IS NULL
),
candidates AS (
  SELECT
    ml.id AS payout_id,
    COUNT(tx.id) AS candidate_count
  FROM missing_links ml
  LEFT JOIN public.finance_transactions tx
    ON tx.type = 'salary'
   AND tx.staff_payout_id IS NULL
   AND tx.staff_id = ml.staff_id
   AND tx.date = ml.payout_date
   AND tx.amount = ml.amount
  GROUP BY ml.id
)
INSERT INTO public.finance_transactions (
  type,
  student_id,
  activity_id,
  staff_id,
  expense_category_id,
  account_id,
  amount,
  date,
  description,
  category,
  dividend_payout_id,
  staff_payout_id
)
SELECT
  'salary'::transaction_type,
  NULL,
  NULL,
  sp.staff_id,
  sp.expense_category_id,
  sp.account_id,
  sp.amount,
  sp.payout_date,
  COALESCE(NULLIF(sp.notes, ''), 'Виплата зарплати (backfill)'),
  NULL,
  sp.dividend_payout_id,
  sp.id
FROM missing_links sp
JOIN candidates c ON c.payout_id = sp.id
WHERE c.candidate_count = 0;

-- 3) Backfill canonical payout subcategory from linked tx when payout value is missing
UPDATE public.staff_payouts sp
SET expense_category_id = tx.expense_category_id
FROM public.finance_transactions tx
WHERE tx.staff_payout_id = sp.id
  AND tx.type = 'salary'
  AND sp.expense_category_id IS NULL
  AND tx.expense_category_id IS NOT NULL;

COMMIT;
