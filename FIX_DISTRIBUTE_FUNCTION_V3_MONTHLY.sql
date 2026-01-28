-- ============================================
-- Новая версия distribute_advance_payment
-- Алгоритм: работаем по месячному периоду, как UI
-- 1. Для каждой активности считаем начисление и оплаты за месяц платежа
-- 2. Сортируем по начислению (charges) от большего к меньшему
-- 3. Гасим долги последовательно: сначала полностью наибольший, потом следующий
-- ============================================

CREATE OR REPLACE FUNCTION public.distribute_advance_payment(
  p_student_id UUID,
  p_account_id UUID,
  p_amount DECIMAL(10,2),
  p_payment_date DATE DEFAULT CURRENT_DATE
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
  v_advance_balance   DECIMAL(10,2) := 0;
  v_remaining_advance DECIMAL(10,2) := 0;
  v_distributed       DECIMAL(10,2) := 0;
  v_payments_count    INTEGER       := 0;
  v_debt_record       RECORD;
  v_payment_amount    DECIMAL(10,2);
  v_month_start       DATE;
  v_month_end         DATE;
BEGIN
  -- Валидация
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'p_student_id cannot be NULL';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'p_account_id cannot be NULL';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be greater than 0';
  END IF;

  -- Определяем границы месяца платежа
  v_month_start := DATE_TRUNC('month', p_payment_date)::DATE;
  v_month_end   := (DATE_TRUNC('month', p_payment_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Увеличиваем авансовый баланс
  INSERT INTO public.advance_balances (student_id, account_id, balance)
  VALUES (p_student_id, p_account_id, p_amount)
  ON CONFLICT (student_id, account_id)
  DO UPDATE SET
    balance   = advance_balances.balance + p_amount,
    updated_at = now();

  -- Текущий аванс
  SELECT balance
  INTO v_advance_balance
  FROM public.advance_balances
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  IF v_advance_balance <= 0 THEN
    RETURN QUERY SELECT 0::DECIMAL(10,2), 0::DECIMAL(10,2), 0;
    RETURN;
  END IF;

  v_remaining_advance := v_advance_balance;

  -- Основной цикл по долгам за месяц
  FOR v_debt_record IN
    WITH enrollment_accounts AS (
      -- Для каждого enrollment определяем account_id (enrollment.account_id ?? activity.account_id)
      SELECT
        e.id  AS enrollment_id,
        e.student_id,
        e.activity_id,
        COALESCE(e.account_id, a.account_id) AS account_id,
        a.name AS activity_name
      FROM public.enrollments e
      JOIN public.activities a ON a.id = e.activity_id
      WHERE e.student_id = p_student_id
        AND e.is_active = true
        AND COALESCE(e.account_id, a.account_id) = p_account_id
    ),
    -- Проверяем, есть ли income транзакции за месяц для каждой активности
    has_income_monthly AS (
      SELECT DISTINCT
        ea.enrollment_id,
        ea.activity_id,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.finance_transactions ft
            WHERE ft.student_id = ea.student_id
              AND ft.activity_id = ea.activity_id
              AND ft.type = 'income'
              AND ft.date >= v_month_start
              AND ft.date <= v_month_end
              AND (
                ft.account_id IS NOT DISTINCT FROM ea.account_id
                OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
              )
          )
          THEN true
          ELSE false
        END AS has_income
      FROM enrollment_accounts ea
    ),
    -- Считаем начисления за месяц (как фронтенд)
    monthly_charges AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        ea.activity_name,
        -- Если есть income за месяц - берём их сумму, иначе attendance.charged_amount за месяц
        CASE
          WHEN COALESCE(hi.has_income, false) THEN
            COALESCE(SUM(CASE WHEN ft.type = 'income' AND ft.date >= v_month_start AND ft.date <= v_month_end THEN ft.amount ELSE 0 END), 0)
          ELSE
            COALESCE(SUM(CASE WHEN att.date >= v_month_start AND att.date <= v_month_end THEN att.charged_amount ELSE 0 END), 0)
        END AS charges
      FROM enrollment_accounts ea
      LEFT JOIN has_income_monthly hi
        ON hi.enrollment_id = ea.enrollment_id
       AND hi.activity_id   = ea.activity_id
      LEFT JOIN public.finance_transactions ft
        ON ft.student_id = ea.student_id
       AND ft.activity_id = ea.activity_id
       AND ft.type = 'income'
       AND ft.date >= v_month_start
       AND ft.date <= v_month_end
       AND (
            ft.account_id IS NOT DISTINCT FROM ea.account_id
         OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
       )
      LEFT JOIN public.attendance att
        ON att.enrollment_id = ea.enrollment_id
       AND COALESCE(hi.has_income, false) = false
      GROUP BY
        ea.enrollment_id,
        ea.activity_id,
        ea.activity_name,
        hi.has_income
    ),
    -- Считаем оплаты за месяц
    monthly_payments AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        COALESCE(SUM(CASE WHEN ft.type IN ('payment', 'advance_payment') AND ft.date >= v_month_start AND ft.date <= v_month_end THEN ft.amount ELSE 0 END), 0) AS payments,
        COALESCE(SUM(CASE WHEN ft.type = 'expense' AND ft.date >= v_month_start AND ft.date <= v_month_end THEN ft.amount ELSE 0 END), 0) AS refunds
      FROM enrollment_accounts ea
      LEFT JOIN public.finance_transactions ft
        ON ft.student_id = ea.student_id
       AND ft.activity_id = ea.activity_id
       AND ft.date >= v_month_start
       AND ft.date <= v_month_end
       AND (
            ft.account_id IS NOT DISTINCT FROM ea.account_id
         OR (ft.account_id IS NULL AND ea.account_id IS NOT NULL)
       )
      GROUP BY
        ea.enrollment_id,
        ea.activity_id
    ),
    -- Объединяем и считаем долг за месяц
    -- Формула как во фронтенде: balance = payments - charges + refunds
    -- Долг = charges - payments - refunds (если > 0)
    monthly_debts AS (
      SELECT
        mc.enrollment_id,
        mc.activity_id,
        mc.activity_name,
        mc.charges,
        mp.payments,
        mp.refunds,
        -- Долг = charges - payments - refunds (refunds уменьшают долг)
        (mc.charges - mp.payments - mp.refunds) AS debt_amount
      FROM monthly_charges mc
      JOIN monthly_payments mp
        ON mp.enrollment_id = mc.enrollment_id
       AND mp.activity_id   = mc.activity_id
      WHERE mc.charges > 0  -- Только активности с начислениями
        AND (mc.charges - mp.payments - mp.refunds) > 0  -- Только те, у кого есть долг
    )
    SELECT
      md.enrollment_id,
      md.activity_id,
      md.activity_name,
      md.charges,
      md.payments,
      md.refunds,
      md.debt_amount
    FROM monthly_debts md
    -- КЛЮЧЕВОЙ МОМЕНТ: сортируем по начислению (charges) от большего к меньшему
    ORDER BY
      md.charges DESC,
      md.debt_amount DESC
  LOOP
    IF v_remaining_advance <= 0 THEN
      EXIT;
    END IF;

    IF v_debt_record.debt_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Сколько гасим сейчас: либо весь долг, либо остаток аванса
    v_payment_amount := LEAST(v_debt_record.debt_amount, v_remaining_advance);

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
      p_payment_date,
      'Автоматичне погашення з авансового рахунку'
    );

    v_payments_count    := v_payments_count + 1;
    v_distributed       := v_distributed + v_payment_amount;
    v_remaining_advance := v_remaining_advance - v_payment_amount;
  END LOOP;

  -- Обновляем аванс
  UPDATE public.advance_balances
  SET balance   = v_remaining_advance,
      updated_at = now()
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  RETURN QUERY SELECT v_distributed, v_remaining_advance, v_payments_count;
END;
$$;

-- Обновляем триггер, чтобы передавать дату платежа
CREATE OR REPLACE FUNCTION public.handle_payment_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process 'payment' type transactions with student_id and account_id
  IF NEW.type = 'payment' AND NEW.student_id IS NOT NULL AND NEW.account_id IS NOT NULL THEN
    -- Call distribution function with payment date
    PERFORM public.distribute_advance_payment(
      NEW.student_id,
      NEW.account_id,
      NEW.amount,
      NEW.date  -- Передаём дату платежа
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE) TO anon;

COMMENT ON FUNCTION public.distribute_advance_payment IS 
'Распределяет авансовый платёж по задолженностям за месяц платежа (Waterfall алгоритм).
Работает точно так же, как UI: считает начисления и оплаты за месяц, сортирует по начислению от большего к меньшему, гасит долги последовательно.';
