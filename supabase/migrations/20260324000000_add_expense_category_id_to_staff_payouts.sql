-- ============================================
-- Add optional subcategory to canonical payroll payouts
-- ============================================

ALTER TABLE public.staff_payouts
ADD COLUMN IF NOT EXISTS expense_category_id UUID
REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_payouts_expense_category_id
ON public.staff_payouts(expense_category_id);

COMMENT ON COLUMN public.staff_payouts.expense_category_id IS
'Необовʼязкова підкатегорія виплати ЗП (canonical поле для UI-фільтрів та відображення).';
