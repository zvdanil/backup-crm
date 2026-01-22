-- ============================================
-- SQL скрипты для экспорта данных таблиц
-- ============================================
-- Выполните эти запросы в Supabase SQL Editor
-- Скопируйте результаты и сохраните в файлы

-- ============================================
-- 1. Экспорт структуры таблиц
-- ============================================

-- Получить список всех таблиц
SELECT 
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================
-- 2. Экспорт данных основных таблиц
-- ============================================

-- Students (Діти)
SELECT * FROM public.students ORDER BY created_at;

-- Activities (Активності)
SELECT * FROM public.activities ORDER BY created_at;

-- Staff (Персонал)
SELECT * FROM public.staff ORDER BY created_at;

-- Enrollments (Записи)
SELECT * FROM public.enrollments ORDER BY created_at;

-- Attendance (Відвідуваність)
SELECT * FROM public.attendance ORDER BY date;

-- Finance Transactions (Фінансові транзакції)
SELECT * FROM public.finance_transactions ORDER BY date;

-- Staff Journal Entries (Журнал персоналу)
SELECT * FROM public.staff_journal_entries ORDER BY date;

-- Staff Billing Rules (Правила нарахування)
SELECT * FROM public.staff_billing_rules ORDER BY effective_from;

-- Group Lessons (Группові заняття)
SELECT * FROM public.group_lessons ORDER BY created_at;

-- Group Lesson Sessions (Сесії групових занять)
SELECT * FROM public.group_lesson_sessions ORDER BY session_date;

-- Staff Payouts (Виплати персоналу)
SELECT * FROM public.staff_payouts ORDER BY payout_date;

-- User Profiles (Профілі користувачів)
SELECT * FROM public.user_profiles ORDER BY created_at;

-- Parent Student Links (Зв'язки батьків та дітей)
SELECT * FROM public.parent_student_links;

-- Payment Accounts (Платіжні рахунки)
SELECT * FROM public.payment_accounts ORDER BY created_at;

-- Expense Categories (Категорії витрат)
SELECT * FROM public.expense_categories ORDER BY created_at;

-- ============================================
-- 3. Экспорт с фильтрацией (опционально)
-- ============================================

-- Только активные студенты
SELECT * FROM public.students WHERE status = 'active' ORDER BY full_name;

-- Только активные активности
SELECT * FROM public.activities WHERE is_active = true ORDER BY name;

-- Только активный персонал
SELECT * FROM public.staff WHERE is_active = true ORDER BY full_name;

-- ============================================
-- 4. Экспорт за определенный период
-- ============================================

-- Финансовые транзакции за последний месяц
SELECT * FROM public.finance_transactions 
WHERE date >= CURRENT_DATE - INTERVAL '1 month'
ORDER BY date;

-- Посещаемость за последний месяц
SELECT * FROM public.attendance 
WHERE date >= CURRENT_DATE - INTERVAL '1 month'
ORDER BY date;

-- ============================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ:
-- ============================================
-- 1. Откройте Supabase SQL Editor
-- 2. Выполните нужные SELECT запросы
-- 3. Скопируйте результаты
-- 4. Сохраните в CSV или текстовые файлы
-- 5. Или используйте функцию экспорта в SQL Editor (если доступна)
