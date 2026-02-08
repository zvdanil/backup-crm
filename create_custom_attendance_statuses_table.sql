-- Создаём таблицу для кастомных статусов посещаемости
CREATE TABLE IF NOT EXISTS public.custom_attendance_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  counts_as_present BOOLEAN NOT NULL DEFAULT false,
  color TEXT, -- опционально, для UI
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.custom_attendance_statuses ENABLE ROW LEVEL SECURITY;

-- Политика: разрешаем всем всё (как и в других таблицах)
CREATE POLICY "Allow all access to custom_attendance_statuses"
ON public.custom_attendance_statuses
FOR ALL
USING (true)
WITH CHECK (true);

-- Создаём индекс для производительности
CREATE INDEX idx_custom_attendance_statuses_counts_as_present ON public.custom_attendance_statuses(counts_as_present);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_custom_attendance_statuses_updated_at 
    BEFORE UPDATE ON public.custom_attendance_statuses 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- Проверяем что таблица создана
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'custom_attendance_statuses'
ORDER BY ordinal_position;

-- Проверяем RLS политики
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'custom_attendance_statuses';
