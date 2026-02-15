-- ============================================
-- Dividend Journal: participants, payouts, legs, settings
-- ============================================

-- Participants (участники) — доли в процентах, сумма должна быть 100%
CREATE TABLE IF NOT EXISTS public.dividend_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  share_percent DECIMAL(5,2) NOT NULL CHECK (share_percent >= 0 AND share_percent <= 100),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Settings: default cleaning percent (ключ-значение)
CREATE TABLE IF NOT EXISTS public.dividend_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.dividend_settings (key, value_json)
VALUES ('default_cleaning_percent', '20')
ON CONFLICT (key) DO NOTHING;

-- Payouts (выплаты): один участник, дата, тип нал/безнал, сумма, % очистки
CREATE TABLE IF NOT EXISTS public.dividend_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.dividend_participants(id) ON DELETE RESTRICT,
  payout_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'non_cash')),
  total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount > 0),
  cleaning_percent DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (cleaning_percent >= 0 AND cleaning_percent <= 100),
  credited_amount DECIMAL(12,2) NOT NULL CHECK (credited_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dividend_payouts_date ON public.dividend_payouts(payout_date);
CREATE INDEX IF NOT EXISTS idx_dividend_payouts_participant ON public.dividend_payouts(participant_id);

-- Payout legs (ноги): списание с разных счетов в рамках одной выплаты
CREATE TABLE IF NOT EXISTS public.dividend_payout_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.dividend_payouts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dividend_payout_legs_payout ON public.dividend_payout_legs(payout_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payout_legs_account ON public.dividend_payout_legs(account_id);

-- RLS
ALTER TABLE public.dividend_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_payout_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all dividend_participants" ON public.dividend_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all dividend_settings" ON public.dividend_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all dividend_payouts" ON public.dividend_payouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all dividend_payout_legs" ON public.dividend_payout_legs FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at for dividend_participants and dividend_payouts
DROP TRIGGER IF EXISTS update_dividend_participants_updated_at ON public.dividend_participants;
CREATE TRIGGER update_dividend_participants_updated_at
  BEFORE UPDATE ON public.dividend_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_dividend_payouts_updated_at ON public.dividend_payouts;
CREATE TRIGGER update_dividend_payouts_updated_at
  BEFORE UPDATE ON public.dividend_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Constraint: sum of legs amount = payout total_amount (enforced in app or trigger)
-- Optional DB trigger to validate (можно добавить при желании)

COMMENT ON TABLE public.dividend_participants IS 'Участники журнала дивидендов; доли в % (сумма 100%)';
COMMENT ON TABLE public.dividend_payouts IS 'Выплаты дивидендов: нал/безнал, сумма, credited_amount = в зачёт доли';
COMMENT ON TABLE public.dividend_payout_legs IS 'Списание по счетам в рамках одной выплаты (мульти-счета)';
