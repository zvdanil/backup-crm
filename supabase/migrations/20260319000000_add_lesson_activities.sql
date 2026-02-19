-- Create lesson_activities table for day calendar / lesson scheduling
-- (Used by useLessonActivities, was not in migrations before)
-- id is BIGSERIAL (bigint) to match Supabase schema
CREATE TABLE IF NOT EXISTS public.lesson_activities (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  teacher TEXT,
  color TEXT,
  start_time TIME,
  end_time TIME,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  start_date DATE,
  comment TEXT,
  rrule JSONB,
  excluded_dates JSONB
);

CREATE INDEX IF NOT EXISTS idx_lesson_activities_activity_id ON public.lesson_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_lesson_activities_teacher_id ON public.lesson_activities(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_activities_start_date ON public.lesson_activities(start_date);

ALTER TABLE public.lesson_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to lesson_activities' AND tablename = 'lesson_activities') THEN
    CREATE POLICY "Allow all access to lesson_activities"
      ON public.lesson_activities FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
