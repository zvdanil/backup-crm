-- Быстрая проверка: есть ли таблица?
SELECT COUNT(*) as records_count 
FROM custom_attendance_statuses;

-- Проверка RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'custom_attendance_statuses';

-- Если RLS включён, проверяем политики
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'custom_attendance_statuses';

-- РЕШЕНИЕ: Добавляем SELECT политику если её нет
-- (запустите только если выше нет политики для SELECT)
DROP POLICY IF EXISTS "Users can view custom attendance statuses in their organization" ON custom_attendance_statuses;

CREATE POLICY "Users can view custom attendance statuses in their organization"
ON custom_attendance_statuses
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Проверяем что теперь можно прочитать
SELECT id, name, counts_as_present 
FROM custom_attendance_statuses
WHERE counts_as_present = true
LIMIT 5;
