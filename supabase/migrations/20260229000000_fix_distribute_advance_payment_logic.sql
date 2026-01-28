-- ============================================
-- Fix distribute_advance_payment function logic
-- Правильная логика расчета долга:
-- 1. Если есть income транзакции - используем их
-- 2. Если нет income транзакций - используем attendance.charged_amount
-- 3. НИКОГДА не используем GREATEST между ними
-- 4. При каждом платеже пересчитываем долги заново
-- 5. Сортируем по долгу от большего к меньшему
-- 6. Гасим долги последовательно (сначала полностью наибольший)
-- ============================================

CREATE OR REPLACE FUNCTION public.distribute_advance_payment(
  p_student_id UUID,
  p_account_id UUID,
  p_amount DECIMAL(10,2)
)
RETURNS TABLE(
  distributed_amount DECIMAL(10,2),
  remaining_advance DECIMAL(10,2),
  payments_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance_balance DECIMAL(10,2) := 0;
  v_remaining_advance DECIMAL(10,2) := 0;
  v_distributed DECIMAL(10,2) := 0;
  v_payments_count INTEGER := 0;
  v_debt_record RECORD;
  v_payment_amount DECIMAL(10,2);
BEGIN
  -- Validate input parameters
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'p_student_id cannot be NULL';
  END IF;
  
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'p_account_id cannot be NULL';
  END IF;
  
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be greater than 0';
  END IF;
  
  -- Initialize or update advance balance
  INSERT INTO public.advance_balances (student_id, account_id, balance)
  VALUES (p_student_id, p_account_id, p_amount)
  ON CONFLICT (student_id, account_id)
  DO UPDATE SET 
    balance = advance_balances.balance + p_amount,
    updated_at = now();
  
  -- Get current advance balance
  SELECT balance INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id AND account_id = p_account_id;
  
  -- If no advance balance, return early
  IF v_advance_balance <= 0 THEN
    RETURN QUERY SELECT 0::DECIMAL(10,2), 0::DECIMAL(10,2), 0;
    RETURN;
  END IF;
  
  v_remaining_advance := v_advance_balance;
  
  -- Find all enrollments for this student with debts on this account
  -- Calculate balance for each enrollment (charges - payments)
  -- ВАЖНО: При каждом платеже пересчитываем долги заново, учитывая все предыдущие advance_payment
  FOR v_debt_record IN
    WITH enrollment_accounts AS (
      -- Get account_id for each enrollment (enrollment.account_id ?? activity.account_id)
      SELECT 
        e.id AS enrollment_id,
        e.student_id,
        e.activity_id,
        COALESCE(e.account_id, a.account_id) AS account_id
      FROM public.enrollments e
      INNER JOIN public.activities a ON e.activity_id = a.id
      WHERE e.student_id = p_student_id
        AND e.is_active = true
        AND COALESCE(e.account_id, a.account_id) = p_account_id
    ),
    -- Сначала определяем, есть ли income транзакции для каждой активности
    -- Учитываем account_id при проверке
    has_income AS (
      SELECT DISTINCT
        ea.enrollment_id,
        ea.activity_id,
        ea.account_id,
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM public.finance_transactions ft 
            WHERE ft.student_id = ea.student_id 
              AND ft.activity_id = ea.activity_id
              AND ft.type = 'income'
              AND (
                ft.account_id IS NOT DISTINCT FROM ea.account_id
                OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
              )
          ) THEN true
          ELSE false
        END AS has_income_transactions
      FROM enrollment_accounts ea
    ),
    enrollment_balances AS (
      -- Calculate balance for each enrollment
      -- Balance formula: charges - payments - refunds
      -- Debt = charges - payments - refunds (positive balance = debt)
      SELECT 
        ea.enrollment_id,
        ea.activity_id,
        ea.account_id,
        -- Charges: если есть income транзакции - используем их, иначе attendance.charged_amount
        CASE 
          WHEN COALESCE(hi.has_income_transactions, false) THEN
            COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0)
          ELSE
            COALESCE(SUM(a.charged_amount), 0)
        END AS charges,
        -- Payments: все payment и advance_payment транзакции
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0) AS payments,
        -- Refunds: expense транзакции
        COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS refunds
      FROM enrollment_accounts ea
      LEFT JOIN has_income hi ON 
        hi.enrollment_id = ea.enrollment_id 
        AND hi.activity_id = ea.activity_id
        AND hi.account_id IS NOT DISTINCT FROM ea.account_id
      -- LEFT JOIN finance_transactions для всех типов транзакций
      LEFT JOIN public.finance_transactions ft ON 
        ft.student_id = ea.student_id 
        AND ft.activity_id = ea.activity_id
        AND (
          -- Транзакции с правильным account_id
          ft.account_id IS NOT DISTINCT FROM ea.account_id
          -- ИЛИ старые транзакции с NULL account_id (если для enrollment/activity установлен account_id)
          OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
        )
      -- LEFT JOIN attendance только если НЕТ income транзакций
      LEFT JOIN public.attendance a ON 
        a.enrollment_id = ea.enrollment_id
        AND COALESCE(hi.has_income_transactions, false) = false
      GROUP BY ea.enrollment_id, ea.activity_id, ea.account_id, hi.has_income_transactions
      HAVING 
        -- Рассчитываем balance и проверяем, что он > 0 (есть долг)
        (
          CASE 
            WHEN COALESCE(hi.has_income_transactions, false) THEN
              COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0)
            ELSE
              COALESCE(SUM(a.charged_amount), 0)
          END
          - COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') THEN ft.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0)
        ) > 0
    )
    SELECT 
      eb.enrollment_id,
      eb.activity_id,
      -- Рассчитываем debt_amount (долг) для сортировки и распределения
      (eb.charges - eb.payments - eb.refunds) AS debt_amount
    FROM enrollment_balances eb
    ORDER BY (eb.charges - eb.payments - eb.refunds) DESC -- Sort by debt amount (largest first)
  LOOP
    -- If no remaining advance, stop
    IF v_remaining_advance <= 0 THEN
      EXIT;
    END IF;
    
    -- Если долг уже погашен (не должен случиться, но на всякий случай)
    IF v_debt_record.debt_amount <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Calculate payment amount (full debt or remaining advance, whichever is smaller)
    -- ВАЖНО: Гасим долг полностью, если хватает средств, иначе гасим частично
    v_payment_amount := LEAST(v_debt_record.debt_amount, v_remaining_advance);
    
    -- Create advance_payment transaction
    INSERT INTO public.finance_transactions (
      type,
      student_id,
      activity_id,
      account_id,
      amount,
      date,
      description
    ) VALUES (
      'advance_payment',
      p_student_id,
      v_debt_record.activity_id,
      p_account_id,
      v_payment_amount,
      CURRENT_DATE,
      'Автоматичне погашення з авансового рахунку'
    );
    
    v_payments_count := v_payments_count + 1;
    v_distributed := v_distributed + v_payment_amount;
    v_remaining_advance := v_remaining_advance - v_payment_amount;
    
    -- После создания транзакции, если долг полностью погашен, переходим к следующему
    -- Если остались средства, продолжаем цикл для следующего долга
  END LOOP;
  
  -- Update advance balance with remaining amount
  UPDATE public.advance_balances
  SET balance = v_remaining_advance,
      updated_at = now()
  WHERE student_id = p_student_id AND account_id = p_account_id;
  
  -- Return results
  RETURN QUERY SELECT v_distributed, v_remaining_advance, v_payments_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL) TO anon;

COMMENT ON FUNCTION public.distribute_advance_payment IS 
'Распределяет авансовый платёж по задолженностям (Waterfall алгоритм). 
При каждом платеже пересчитывает долги заново, учитывая все предыдущие advance_payment транзакции.
Гасит долги от самого большого к самому маленькому, полностью погашая каждый долг перед переходом к следующему.
Правильная логика расчета charges: если есть income транзакции - используем их, иначе attendance.charged_amount.';
