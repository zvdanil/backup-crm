-- ============================================
-- Enrollment Price History (История изменения цен подписки)
-- ============================================

CREATE TABLE IF NOT EXISTS public.enrollment_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  custom_price DECIMAL(10,2),
  discount_percent DECIMAL(5,2) DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_price_history_enrollment_id ON public.enrollment_price_history(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_price_history_effective_from ON public.enrollment_price_history(effective_from);
CREATE INDEX IF NOT EXISTS idx_enrollment_price_history_effective_to ON public.enrollment_price_history(effective_to);

ALTER TABLE public.enrollment_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all enrollment_price_history" ON public.enrollment_price_history FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_enrollment_price_history_updated_at ON public.enrollment_price_history;
CREATE TRIGGER update_enrollment_price_history_updated_at
  BEFORE UPDATE ON public.enrollment_price_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.enrollment_price_history IS 'Історія змін ціни та знижки для конкретної підписки (enrollment)';
COMMENT ON COLUMN public.enrollment_price_history.effective_from IS 'Дата початку дії ціни';
COMMENT ON COLUMN public.enrollment_price_history.effective_to IS 'Дата закінчення дії (NULL = діє дотепер)';
