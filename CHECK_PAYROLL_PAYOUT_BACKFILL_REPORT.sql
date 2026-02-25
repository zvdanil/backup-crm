-- ============================================
-- STEP 11 (dry-run): payroll payouts backfill report
-- Canonical source: staff_payouts
-- Purpose: show what can be linked automatically and what needs manual review
-- ============================================

-- 0) Missing salary tx link for active payouts
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
    COUNT(tx.id) AS candidate_count
  FROM missing_links ml
  LEFT JOIN public.finance_transactions tx
    ON tx.type = 'salary'
   AND tx.staff_payout_id IS NULL
   AND tx.staff_id = ml.staff_id
   AND tx.date = ml.payout_date
   AND tx.amount = ml.amount
  GROUP BY ml.payout_id
)
SELECT
  COUNT(*) AS total_missing_links,
  COUNT(*) FILTER (WHERE c.candidate_count = 0) AS will_create_new_tx,
  COUNT(*) FILTER (WHERE c.candidate_count = 1) AS will_link_unique_tx,
  COUNT(*) FILTER (WHERE c.candidate_count > 1) AS ambiguous_manual_review
FROM candidates c;

-- 1) Ambiguous cases for manual review (NOT auto-fixed)
WITH missing_links AS (
  SELECT
    sp.id AS payout_id,
    sp.staff_id,
    s.full_name AS staff_name,
    sp.payout_date,
    sp.amount
  FROM public.staff_payouts sp
  LEFT JOIN public.staff s ON s.id = sp.staff_id
  LEFT JOIN public.finance_transactions tx
    ON tx.staff_payout_id = sp.id
   AND tx.type = 'salary'
  WHERE COALESCE(sp.is_deleted, false) = false
    AND tx.id IS NULL
),
candidate_rows AS (
  SELECT
    ml.payout_id,
    ml.staff_id,
    ml.staff_name,
    ml.payout_date,
    ml.amount,
    tx.id AS candidate_tx_id
  FROM missing_links ml
  LEFT JOIN public.finance_transactions tx
    ON tx.type = 'salary'
   AND tx.staff_payout_id IS NULL
   AND tx.staff_id = ml.staff_id
   AND tx.date = ml.payout_date
   AND tx.amount = ml.amount
),
ambiguous AS (
  SELECT
    payout_id,
    staff_id,
    staff_name,
    payout_date,
    amount,
    COUNT(candidate_tx_id) AS candidate_count,
    ARRAY_REMOVE(ARRAY_AGG(candidate_tx_id), NULL) AS candidate_tx_ids
  FROM candidate_rows
  GROUP BY payout_id, staff_id, staff_name, payout_date, amount
  HAVING COUNT(candidate_tx_id) > 1
)
SELECT *
FROM ambiguous
ORDER BY payout_date DESC, staff_name NULLS LAST;

-- 2) Payouts with no matching tx candidates (will create new salary tx)
WITH missing_links AS (
  SELECT
    sp.id AS payout_id,
    sp.staff_id,
    s.full_name AS staff_name,
    sp.payout_date,
    sp.amount
  FROM public.staff_payouts sp
  LEFT JOIN public.staff s ON s.id = sp.staff_id
  LEFT JOIN public.finance_transactions tx
    ON tx.staff_payout_id = sp.id
   AND tx.type = 'salary'
  WHERE COALESCE(sp.is_deleted, false) = false
    AND tx.id IS NULL
),
candidates AS (
  SELECT
    ml.payout_id,
    ml.staff_name,
    ml.payout_date,
    ml.amount,
    COUNT(tx.id) AS candidate_count
  FROM missing_links ml
  LEFT JOIN public.finance_transactions tx
    ON tx.type = 'salary'
   AND tx.staff_payout_id IS NULL
   AND tx.staff_id = ml.staff_id
   AND tx.date = ml.payout_date
   AND tx.amount = ml.amount
  GROUP BY ml.payout_id, ml.staff_name, ml.payout_date, ml.amount
)
SELECT *
FROM candidates
WHERE candidate_count = 0
ORDER BY payout_date DESC, staff_name NULLS LAST;

-- 3) Subcategory backfill preview (tx -> payout)
SELECT
  COUNT(*) AS payouts_missing_subcategory_with_linked_tx_subcategory
FROM public.staff_payouts sp
JOIN public.finance_transactions tx
  ON tx.staff_payout_id = sp.id
 AND tx.type = 'salary'
WHERE sp.expense_category_id IS NULL
  AND tx.expense_category_id IS NOT NULL;
