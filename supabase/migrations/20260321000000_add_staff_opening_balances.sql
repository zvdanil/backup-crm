-- ============================================
-- Таблиця початкових залишків педагога на місяць
-- Корекція відображуваного балансу, НЕ впливає на стан рахунків
-- Один запис на педагога на місяць (1-ше число)
-- ============================================

CREATE TABLE IF NOT EXISTS public.staff_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  balance_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, balance_date)
);

COMMENT ON TABLE public.staff_opening_balances IS 'Корекція балансу педагога на місяць; не впливає на рахунки, тільки на відображуваний баланс';
COMMENT ON COLUMN public.staff_opening_balances.balance_date IS 'Дата залишку (1-ше число місяця)';
COMMENT ON COLUMN public.staff_opening_balances.amount IS 'Сума корекції; може бути відʼємною';

CREATE INDEX IF NOT EXISTS idx_staff_opening_balances_staff_date
  ON public.staff_opening_balances(staff_id, balance_date);

ALTER TABLE public.staff_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to staff_opening_balances"
  ON public.staff_opening_balances FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_staff_opening_balances_updated_at
  BEFORE UPDATE ON public.staff_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
