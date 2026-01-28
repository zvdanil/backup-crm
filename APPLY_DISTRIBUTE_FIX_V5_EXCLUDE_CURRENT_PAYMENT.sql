-- ============================================
-- Версия 5: distribute_advance_payment с исключением текущего платежа
-- Проблема: функция учитывает только что созданный платеж при расчёте долга
-- Решение: 
--   1. Передаём ID текущего платежа и исключаем его из расчёта
--   2. Учитываем ТОЛЬКО payment (как в карточке ребёнка), НЕ advance_payment
--      advance_payment - это служебные транзакции, создаваемые функцией для распределения
-- ============================================

DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID);

CREATE OR REPLACE FUNCTION public.distribute_advance_payment(
  p_student_id UUID,
  p_account_id UUID,
  p_amount DECIMAL(10,2),
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_exclude_payment_id UUID DEFAULT NULL  -- ID платежа, который нужно исключить из расчёта
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
  v_refund_record     RECORD;
  v_payment_amount    DECIMAL(10,2);
  v_refund_amount     DECIMAL(10,2);
  v_month_start       DATE;
  v_month_end         DATE;
  v_advance_before_payment DECIMAL(10,2) := 0;
  v_current_total_refunds DECIMAL(10,2) := 0;
  v_refund_difference DECIMAL(10,2) := 0;
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

  -- Получаем текущий авансовый баланс ДО добавления нового платежа
  -- Это нужно, чтобы определить, были ли возвраты уже обработаны ранее
  SELECT COALESCE(balance, 0)
  INTO v_advance_before_payment
  FROM public.advance_balances
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  -- Увеличиваем авансовый баланс на сумму платежа
  INSERT INTO public.advance_balances (student_id, account_id, balance)
  VALUES (p_student_id, p_account_id, p_amount)
  ON CONFLICT (student_id, account_id)
  DO UPDATE SET
    balance   = advance_balances.balance + p_amount,
    updated_at = now();

  -- Обновляем переменную после добавления платежа
  v_advance_balance := v_advance_before_payment + p_amount;

  IF v_advance_balance <= 0 THEN
    RETURN QUERY SELECT 0::DECIMAL(10,2), 0::DECIMAL(10,2), 0;
    RETURN;
  END IF;

  v_remaining_advance := v_advance_balance;

  -- ============================================
  -- ШАГ 1: Обрабатываем возвраты (положительные балансы)
  -- ВАЖНО: вычисляем текущую сумму возвратов и добавляем только разницу с уже обработанной
  -- Это учитывает изменение возвратов (например, когда ребёнок не пришёл и возврат увеличился)
  -- ============================================
  -- Вычисляем текущую сумму всех возвратов
  WITH refunds_calculation AS (
    WITH enrollment_accounts AS (
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
    monthly_charges AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        ea.activity_name,
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
    monthly_payments AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        -- ВАЖНО: учитываем ТОЛЬКО payment (как в карточке ребёнка), НЕ advance_payment
        -- advance_payment - это служебные транзакции, создаваемые функцией для распределения
        -- Исключаем текущий платеж из расчёта
        COALESCE(SUM(CASE 
          WHEN ft.type = 'payment'
            AND ft.date >= v_month_start 
            AND ft.date <= v_month_end
            AND (p_exclude_payment_id IS NULL OR ft.id != p_exclude_payment_id)
          THEN ft.amount 
          ELSE 0 
        END), 0) AS payments,
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
    monthly_refunds AS (
      SELECT
        mc.enrollment_id,
        mc.activity_id,
        mc.activity_name,
        mc.charges,
        mp.payments,
        mp.refunds,
        (mp.payments - mc.charges + mp.refunds) AS positive_balance
      FROM monthly_charges mc
      JOIN monthly_payments mp
        ON mp.enrollment_id = mc.enrollment_id
       AND mp.activity_id   = mc.activity_id
      WHERE (mp.payments - mc.charges + mp.refunds) > 0
    )
    SELECT
      mr.enrollment_id,
      mr.activity_id,
      mr.activity_name,
      mr.positive_balance
    FROM monthly_refunds mr
  )
  SELECT COALESCE(SUM(positive_balance), 0)
  INTO v_current_total_refunds
  FROM refunds_calculation;

  -- Вычисляем разницу: текущая сумма возвратов - сумма возвратов, которая уже была обработана
  -- Если авансовый баланс ДО добавления платежа был <= 0, значит возвраты ещё не обрабатывались
  -- Если авансовый баланс ДО добавления платежа был > 0, значит возвраты уже были обработаны
  -- В этом случае добавляем только разницу (если текущая сумма больше уже обработанной)
  -- Используем простую эвристику: если текущая сумма возвратов больше авансового баланса ДО платежа,
  -- значит возвраты увеличились и нужно добавить разницу
  IF v_advance_before_payment <= 0 THEN
    -- Первый платёж или аванс был полностью израсходован → обрабатываем все возвраты
    v_refund_difference := v_current_total_refunds;
  ELSE
    -- Возвраты уже были обработаны → добавляем только разницу, если текущая сумма больше
    -- Используем простую эвристику: если текущая сумма возвратов > авансового баланса ДО платежа,
    -- значит возвраты увеличились и нужно добавить разницу
    -- Но это не идеально, так как авансовый баланс может содержать и другие платежи
    -- Поэтому используем более точный подход: сравниваем с суммой всех возвратов, которые уже были обработаны
    -- Пока используем простую эвристику: если текущая сумма возвратов > авансового баланса ДО платежа,
    -- значит возвраты увеличились и нужно добавить разницу
    v_refund_difference := GREATEST(0, v_current_total_refunds - v_advance_before_payment);
  END IF;

  -- Добавляем разницу в авансовый баланс
  IF v_refund_difference > 0 THEN
    UPDATE public.advance_balances
    SET balance = balance + v_refund_difference,
        updated_at = now()
    WHERE student_id = p_student_id
      AND account_id = p_account_id;
    
    v_remaining_advance := v_remaining_advance + v_refund_difference;
  END IF;
  -- Конец блока обработки возвратов

  -- ============================================
  -- ШАГ 2: Обрабатываем долги
  -- ============================================
  FOR v_debt_record IN
    WITH enrollment_accounts AS (
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
    monthly_charges AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        ea.activity_name,
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
    monthly_payments AS (
      SELECT
        ea.enrollment_id,
        ea.activity_id,
        -- ВАЖНО: учитываем ТОЛЬКО payment (как в карточке ребёнка), НЕ advance_payment
        -- advance_payment - это служебные транзакции, создаваемые функцией для распределения
        -- Исключаем текущий платеж из расчёта
        COALESCE(SUM(CASE 
          WHEN ft.type = 'payment'
            AND ft.date >= v_month_start 
            AND ft.date <= v_month_end
            AND (p_exclude_payment_id IS NULL OR ft.id != p_exclude_payment_id)
          THEN ft.amount 
          ELSE 0 
        END), 0) AS payments,
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
    monthly_debts AS (
      SELECT
        mc.enrollment_id,
        mc.activity_id,
        mc.activity_name,
        mc.charges,
        mp.payments,
        mp.refunds,
        (mc.charges - mp.payments - mp.refunds) AS debt_amount
      FROM monthly_charges mc
      JOIN monthly_payments mp
        ON mp.enrollment_id = mc.enrollment_id
       AND mp.activity_id   = mc.activity_id
      WHERE mc.charges > 0
        AND (mc.charges - mp.payments - mp.refunds) > 0
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

  UPDATE public.advance_balances
  SET balance = v_remaining_advance,
      updated_at = now()
  WHERE student_id = p_student_id
    AND account_id = p_account_id;

  RETURN QUERY SELECT v_distributed, v_remaining_advance, v_payments_count;
END;
$$;

-- Обновляем триггер, чтобы передавать ID текущего платежа
CREATE OR REPLACE FUNCTION public.handle_payment_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'payment' AND NEW.student_id IS NOT NULL AND NEW.account_id IS NOT NULL THEN
    -- Передаём ID текущего платежа, чтобы исключить его из расчёта долга
    PERFORM public.distribute_advance_payment(
      NEW.student_id,
      NEW.account_id,
      NEW.amount,
      NEW.date,
      NEW.id  -- ID текущего платежа для исключения из расчёта
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID) TO anon;

COMMENT ON FUNCTION public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID) IS 
'Распределяет авансовый платёж по задолженностям за месяц платежа (Waterfall алгоритм).
ШАГ 1: Находит активности с положительным балансом (возвраты за питание) и добавляет их на авансовый счёт.
ШАГ 2: Обрабатывает активности с долгами: сортирует по начислению от большего к меньшему, гасит долги последовательно.
ВАЖНО: исключает текущий платеж (p_exclude_payment_id) из расчёта долга, чтобы не учитывать его дважды.';
