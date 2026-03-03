-- Таблиця виключень абонплатних нарахувань (коли користувач натискає корзину).
-- Значення «Нараховано на початок місяця» береться з білінгових правил, але
-- не включає активності, що були виключені через корзину.
CREATE TABLE public.subscription_charge_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month >= 0 AND month <= 11),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (enrollment_id, year, month)
);

CREATE INDEX idx_subscription_charge_exclusions_enrollment_year_month
  ON public.subscription_charge_exclusions (enrollment_id, year, month);

ALTER TABLE public.subscription_charge_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to subscription_charge_exclusions"
  ON public.subscription_charge_exclusions FOR ALL
  USING (true) WITH CHECK (true);
