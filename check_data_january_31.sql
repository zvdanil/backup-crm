-- Проверка данных за 31 января 2026 года
-- Этот запрос показывает все данные, которые будут удалены

-- Сводка по всем таблицам
SELECT 
    'attendance' as table_name,
    COUNT(*) as record_count
FROM attendance
WHERE date = '2026-01-31'

UNION ALL

SELECT 
    'finance_transactions' as table_name,
    COUNT(*) as record_count
FROM finance_transactions
WHERE date = '2026-01-31'

UNION ALL

SELECT 
    'staff_journal_entries' as table_name,
    COUNT(*) as record_count
FROM staff_journal_entries
WHERE date = '2026-01-31';

-- 1. Детальная проверка attendance за 31.01.2026
SELECT 
    '=== ATTENDANCE ===' as section,
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.date = '2026-01-31'
ORDER BY s.full_name, act.name;

-- 2. Детальная проверка finance_transactions за 31.01.2026
SELECT 
    '=== FINANCE_TRANSACTIONS ===' as section,
    ft.id,
    ft.student_id,
    ft.activity_id,
    ft.date,
    ft.amount,
    ft.type,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category
FROM finance_transactions ft
LEFT JOIN students s ON s.id = ft.student_id
LEFT JOIN activities act ON act.id = ft.activity_id
WHERE ft.date = '2026-01-31'
ORDER BY s.full_name, act.name;

-- 3. Детальная проверка staff_journal_entries за 31.01.2026
SELECT 
    '=== STAFF_JOURNAL_ENTRIES ===' as section,
    sje.id,
    sje.staff_id,
    sje.activity_id,
    sje.date,
    sje.amount,
    sje.is_manual_override,
    st.full_name as staff_name,
    act.name as activity_name
FROM staff_journal_entries sje
LEFT JOIN staff st ON st.id = sje.staff_id
LEFT JOIN activities act ON act.id = sje.activity_id
WHERE sje.date = '2026-01-31'
ORDER BY st.full_name, act.name;

-- 4. Проверка: может быть данные в других форматах даты или есть связанные записи
-- Проверяем attendance с похожими датами
SELECT 
    '=== ATTENDANCE NEAR 31.01 ===' as section,
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.date >= '2026-01-30' AND a.date <= '2026-02-01'
ORDER BY a.date, s.full_name, act.name;

-- Проверяем finance_transactions с похожими датами
SELECT 
    '=== FINANCE_TRANSACTIONS NEAR 31.01 ===' as section,
    ft.id,
    ft.student_id,
    ft.activity_id,
    ft.date,
    ft.amount,
    ft.type,
    s.full_name as student_name,
    act.name as activity_name
FROM finance_transactions ft
LEFT JOIN students s ON s.id = ft.student_id
LEFT JOIN activities act ON act.id = ft.activity_id
WHERE ft.date >= '2026-01-30' AND ft.date <= '2026-02-01'
ORDER BY ft.date, s.full_name, act.name;
