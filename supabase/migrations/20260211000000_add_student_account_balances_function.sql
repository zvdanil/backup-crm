-- Function to calculate student account balances for a specific month
-- This replaces frontend calculation with database-level aggregation for better performance

CREATE OR REPLACE FUNCTION public.get_student_account_balances(
  p_student_id UUID,
  p_month INTEGER,
  p_year INTEGER,
  p_exclude_activity_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_food_tariff_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_cumulative BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  account_id UUID,
  balance NUMERIC,
  payments NUMERIC,
  charges NUMERIC,
  refunds NUMERIC,
  previous_balance NUMERIC,
  unassigned_payments NUMERIC,
  balance_at_period_end NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_earliest_enrolled DATE;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  -- Determine date range based on cumulative flag
  v_month_start := DATE_TRUNC('month', MAKE_DATE(p_year, p_month + 1, 1))::DATE;
  v_month_end := (DATE_TRUNC('month', MAKE_DATE(p_year, p_month + 1, 1)) + INTERVAL '1 month - 1 day')::DATE;
  
  -- Find earliest enrollment date
  SELECT MIN(enrolled_at)
  INTO v_earliest_enrolled
  FROM public.enrollments
  WHERE student_id = p_student_id
    AND enrolled_at IS NOT NULL
    AND (array_length(p_exclude_activity_ids, 1) IS NULL OR activity_id != ALL(p_exclude_activity_ids));
  
  IF v_earliest_enrolled IS NULL THEN
    RETURN;
  END IF;
  
  IF p_cumulative THEN
    v_start_date := DATE_TRUNC('month', v_earliest_enrolled)::DATE;
    v_end_date := v_month_end;
  ELSE
    v_start_date := v_month_start;
    v_end_date := v_month_end;
  END IF;
  
  RETURN QUERY
  WITH filtered_enrollments AS (
    SELECT 
      e.id AS enrollment_id,
      e.activity_id,
      COALESCE(e.account_id, a.account_id) AS account_id,
      e.is_active,
      e.enrolled_at,
      e.unenrolled_at,
      e.custom_price,
      e.discount_percent
    FROM public.enrollments e
    INNER JOIN public.activities a ON e.activity_id = a.id
    WHERE e.student_id = p_student_id
      AND (array_length(p_exclude_activity_ids, 1) IS NULL OR e.activity_id != ALL(p_exclude_activity_ids))
      AND (
        -- Enrollment must be enrolled before or in the target month
        (e.enrolled_at IS NULL OR e.enrolled_at <= v_month_end)
        -- And not unenrolled before the target month
        AND (e.unenrolled_at IS NULL OR e.unenrolled_at >= v_month_start)
      )
  ),
  month_transactions AS (
    SELECT 
      ft.account_id,
      ft.activity_id,
      ft.type,
      ft.amount
    FROM public.finance_transactions ft
    WHERE ft.student_id = p_student_id
      AND ft.date >= v_start_date
      AND ft.date <= v_end_date
      AND ft.type IN ('payment', 'income', 'expense')
  ),
  month_attendance AS (
    SELECT 
      a.enrollment_id,
      a.charged_amount,
      fe.account_id
    FROM public.attendance a
    INNER JOIN filtered_enrollments fe ON a.enrollment_id = fe.enrollment_id
    WHERE a.date >= v_start_date
      AND a.date <= v_end_date
  ),
  account_balances AS (
    SELECT 
      COALESCE(fe.account_id, mt.account_id) AS account_id,
      -- Payments: sum of payment transactions (including unassigned)
      COALESCE(SUM(CASE WHEN mt.type = 'payment' AND mt.activity_id IS NULL THEN mt.amount ELSE 0 END), 0) AS unassigned_payments,
      COALESCE(SUM(CASE WHEN mt.type = 'payment' AND mt.activity_id IS NOT NULL THEN mt.amount ELSE 0 END), 0) AS payments_by_activity,
      -- Charges: income transactions or attendance charges
      COALESCE(SUM(CASE WHEN mt.type = 'income' THEN mt.amount ELSE 0 END), 0) AS charges_from_transactions,
      COALESCE(SUM(ma.charged_amount), 0) AS charges_from_attendance,
      -- Refunds: expense transactions
      COALESCE(SUM(CASE WHEN mt.type = 'expense' THEN mt.amount ELSE 0 END), 0) AS refunds
    FROM filtered_enrollments fe
    LEFT JOIN month_transactions mt ON 
      mt.activity_id = fe.activity_id 
      AND (mt.account_id IS NOT DISTINCT FROM fe.account_id)
    LEFT JOIN month_attendance ma ON ma.enrollment_id = fe.enrollment_id
    GROUP BY COALESCE(fe.account_id, mt.account_id)
  )
  SELECT 
    ab.account_id,
    -- Balance: payments - charges + refunds
    (ab.payments_by_activity + ab.unassigned_payments) - 
    GREATEST(ab.charges_from_transactions, ab.charges_from_attendance) + 
    ab.refunds AS balance,
    ab.payments_by_activity + ab.unassigned_payments AS payments,
    GREATEST(ab.charges_from_transactions, ab.charges_from_attendance) AS charges,
    ab.refunds AS refunds,
    0::NUMERIC AS previous_balance, -- TODO: calculate previous balance
    ab.unassigned_payments AS unassigned_payments,
    0::NUMERIC AS balance_at_period_end -- TODO: calculate period end balance
  FROM account_balances ab;
END;
$$;

COMMENT ON FUNCTION public.get_student_account_balances IS 
'Calculate student account balances for a specific month. Returns aggregated balances per account.';
