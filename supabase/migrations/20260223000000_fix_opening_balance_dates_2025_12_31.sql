-- ============================================
-- Виправлення дат внесених залишків
-- Усі записи з balance_date = 2025-12-31 → 2026-01-01
-- ============================================

-- Якщо вже є запис 2026-01-01 для того ж (student_id, account_id): додаємо amount і видаляємо 2025-12-31
-- Інакше: просто оновлюємо дату
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, student_id, account_id, amount
    FROM public.account_opening_balances
    WHERE balance_date = '2025-12-31'
  LOOP
    UPDATE public.account_opening_balances
    SET amount = amount + r.amount,
        updated_at = now()
    WHERE student_id = r.student_id
      AND account_id = r.account_id
      AND balance_date = '2026-01-01';

    IF FOUND THEN
      DELETE FROM public.account_opening_balances
      WHERE id = r.id;
    ELSE
      UPDATE public.account_opening_balances
      SET balance_date = '2026-01-01',
          updated_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
