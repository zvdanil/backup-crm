-- Проверяем есть ли поле custom_status_id в таблице attendance
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'attendance' 
  AND column_name = 'custom_status_id';

-- Если поля нет, добавляем его
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS custom_status_id UUID REFERENCES public.custom_attendance_statuses(id) ON DELETE SET NULL;

-- Создаём индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_attendance_custom_status_id ON public.attendance(custom_status_id);

-- Проверяем результат
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'attendance' 
  AND column_name IN ('status', 'custom_status_id')
ORDER BY ordinal_position;
