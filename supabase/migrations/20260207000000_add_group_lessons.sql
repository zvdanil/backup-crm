CREATE TABLE IF NOT EXISTS public.group_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(activity_id, name)
);

CREATE TABLE IF NOT EXISTS public.group_lesson_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_lesson_id UUID NOT NULL REFERENCES public.group_lessons(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(group_lesson_id, staff_id)
);

ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS group_lesson_id UUID REFERENCES public.group_lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_lessons_activity_id ON public.group_lessons(activity_id);
CREATE INDEX IF NOT EXISTS idx_group_lesson_staff_lesson_id ON public.group_lesson_staff(group_lesson_id);
CREATE INDEX IF NOT EXISTS idx_group_lesson_staff_staff_id ON public.group_lesson_staff(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_group_lesson_id ON public.attendance(group_lesson_id);

ALTER TABLE public.group_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_lesson_staff ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to group_lessons' AND tablename = 'group_lessons'
  ) THEN
    CREATE POLICY "Allow all access to group_lessons"
      ON public.group_lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to group_lesson_staff' AND tablename = 'group_lesson_staff'
  ) THEN
    CREATE POLICY "Allow all access to group_lesson_staff"
      ON public.group_lesson_staff FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_group_lessons_updated_at ON public.group_lessons;
CREATE TRIGGER update_group_lessons_updated_at
  BEFORE UPDATE ON public.group_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
