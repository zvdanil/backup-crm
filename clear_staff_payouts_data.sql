-- ============================================
-- Очистка данных по начислению выплат персоналу
-- ============================================
-- ВНИМАНИЕ: Этот скрипт удалит ВСЕ данные о начислениях и выплатах персоналу!
-- Выполните этот скрипт в Supabase SQL Editor
-- ============================================

-- 1. Удаление всех выплат зарплаты (staff_payouts)
DELETE FROM public.staff_payouts;

-- 2. Удаление всех записей журнала начислений персоналу (staff_journal_entries)
DELETE FROM public.staff_journal_entries;

-- 3. Удаление всех финансовых транзакций типа 'salary' (зарплата)
DELETE FROM public.finance_transactions 
WHERE type = 'salary';

-- 4. (Опционально) Удаление истории ручных ставок персоналу
-- Раскомментируйте следующую строку, если нужно также удалить историю ставок:
-- DELETE FROM public.staff_manual_rate_history;

-- ============================================
-- Проверка результатов
-- ============================================
-- Выполните следующие запросы для проверки количества оставшихся записей:

-- SELECT COUNT(*) as staff_payouts_count FROM public.staff_payouts;
-- SELECT COUNT(*) as staff_journal_entries_count FROM public.staff_journal_entries;
-- SELECT COUNT(*) as salary_transactions_count FROM public.finance_transactions WHERE type = 'salary';
-- SELECT COUNT(*) as manual_rate_history_count FROM public.staff_manual_rate_history;

-- ============================================
-- Конец скрипта
-- ============================================
