-- Удаление данных за 31 января 2026 года
-- ВНИМАНИЕ: Этот запрос удалит все данные за указанную дату!
-- Рекомендуется сначала выполнить check_data_january_31.sql для проверки
-- 
-- Данные за 31.01.2026 находятся в finance_transactions (Garden Attendance Journal)
-- Это записи типа 'income' для активностей "Дитсадок повний день", "Дитсадок пів дня", "Прескул"

BEGIN;

-- 1. Удаление finance_transactions за 31.01.2026 (основные данные)
-- Это записи из Garden Attendance Journal
DELETE FROM finance_transactions
WHERE date = '2026-01-31';

-- 2. Удаление attendance за 31.01.2026 (если есть)
DELETE FROM attendance
WHERE date = '2026-01-31';

-- 3. Удаление staff_journal_entries за 31.01.2026 (если есть)
DELETE FROM staff_journal_entries
WHERE date = '2026-01-31';

-- Проверка результатов удаления
SELECT 
    'attendance' as table_name,
    COUNT(*) as remaining_records
FROM attendance
WHERE date = '2026-01-31'

UNION ALL

SELECT 
    'finance_transactions' as table_name,
    COUNT(*) as remaining_records
FROM finance_transactions
WHERE date = '2026-01-31'

UNION ALL

SELECT 
    'staff_journal_entries' as table_name,
    COUNT(*) as remaining_records
FROM staff_journal_entries
WHERE date = '2026-01-31';

COMMIT;
