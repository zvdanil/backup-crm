-- ============================================
-- Migrate attendance.status from enum to TEXT
-- Add index for performance
-- Add notes length constraint
-- ============================================

-- 1. Создать временную колонку status_text
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status_text TEXT;

-- 2. Скопировать значения из enum в text
UPDATE public.attendance SET status_text = status::TEXT;

-- 3. Удалить старую колонку enum
ALTER TABLE public.attendance DROP COLUMN IF EXISTS status;

-- 4. Переименовать status_text в status
ALTER TABLE public.attendance RENAME COLUMN status_text TO status;

-- 5. Добавить индекс для частых фильтраций по status
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- 6. Добавить ограничение на длину notes (если еще не добавлено)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'attendance_notes_length'
  ) THEN
    ALTER TABLE public.attendance 
    ADD CONSTRAINT attendance_notes_length 
    CHECK (LENGTH(notes) <= 200);
  END IF;
END $$;

-- 7. Добавить комментарий к колонке
COMMENT ON COLUMN public.attendance.status IS 'Attendance status: базовые (present/sick/absent/vacation) или UUID кастомных статусов из billing_rules.custom_statuses';
