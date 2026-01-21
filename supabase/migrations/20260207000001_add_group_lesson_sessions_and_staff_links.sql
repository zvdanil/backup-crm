CREATE TABLE IF NOT EXISTS public.group_lesson_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_lesson_id UUID NOT NULL REFERENCES public.group_lessons(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    sessions_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(group_lesson_id, session_date)
);

ALTER TABLE public.staff_billing_rules
ADD COLUMN IF NOT EXISTS group_lesson_id UUID REFERENCES public.group_lessons(id) ON DELETE SET NULL;

ALTER TABLE public.staff_journal_entries
ADD COLUMN IF NOT EXISTS group_lesson_id UUID REFERENCES public.group_lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_lesson_sessions_lesson_id ON public.group_lesson_sessions(group_lesson_id);
CREATE INDEX IF NOT EXISTS idx_group_lesson_sessions_date ON public.group_lesson_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_staff_billing_rules_group_lesson_id ON public.staff_billing_rules(group_lesson_id);
CREATE INDEX IF NOT EXISTS idx_staff_journal_entries_group_lesson_id ON public.staff_journal_entries(group_lesson_id);

ALTER TABLE public.group_lesson_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to group_lesson_sessions' AND tablename = 'group_lesson_sessions'
  ) THEN
    CREATE POLICY "Allow all access to group_lesson_sessions"
      ON public.group_lesson_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_group_lesson_sessions_updated_at ON public.group_lesson_sessions;
CREATE TRIGGER update_group_lesson_sessions_updated_at
  BEFORE UPDATE ON public.group_lesson_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.staff_journal_entries
DROP CONSTRAINT IF EXISTS staff_journal_entries_staff_id_activity_id_date_manual_key;

ALTER TABLE public.staff_journal_entries
ADD CONSTRAINT staff_journal_entries_staff_id_activity_id_date_group_manual_key
UNIQUE (staff_id, activity_id, group_lesson_id, date, is_manual_override);
