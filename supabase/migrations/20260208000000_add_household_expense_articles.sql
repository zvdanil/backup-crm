DO $$ BEGIN
  CREATE TYPE public.expense_input_mode AS ENUM ('rate', 'manual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.expense_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    input_mode public.expense_input_mode NOT NULL DEFAULT 'manual',
    rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(activity_id, name)
);

CREATE TABLE IF NOT EXISTS public.expense_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    expense_article_id UUID NOT NULL REFERENCES public.expense_articles(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    quantity INTEGER,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(expense_article_id, entry_date)
);

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS expense_article_id UUID REFERENCES public.expense_articles(id) ON DELETE SET NULL;

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS expense_entry_id UUID REFERENCES public.expense_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS quantity INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_expense_entry_id
  ON public.finance_transactions(expense_entry_id);

CREATE INDEX IF NOT EXISTS idx_expense_articles_activity_id ON public.expense_articles(activity_id);
CREATE INDEX IF NOT EXISTS idx_expense_journal_entries_activity_date ON public.expense_journal_entries(activity_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_expense_journal_entries_article_id ON public.expense_journal_entries(expense_article_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_expense_article_id ON public.finance_transactions(expense_article_id);

ALTER TABLE public.expense_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_journal_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to expense_articles' AND tablename = 'expense_articles'
  ) THEN
    CREATE POLICY "Allow all access to expense_articles"
      ON public.expense_articles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to expense_journal_entries' AND tablename = 'expense_journal_entries'
  ) THEN
    CREATE POLICY "Allow all access to expense_journal_entries"
      ON public.expense_journal_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_expense_articles_updated_at ON public.expense_articles;
CREATE TRIGGER update_expense_articles_updated_at
  BEFORE UPDATE ON public.expense_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_expense_journal_entries_updated_at ON public.expense_journal_entries;
CREATE TRIGGER update_expense_journal_entries_updated_at
  BEFORE UPDATE ON public.expense_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
