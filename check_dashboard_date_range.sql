-- ============================================
-- Проверка диапазона дат для дашборда за январь 2026
-- Этот запрос проверяет, попадает ли запись от 29.01.2026 в диапазон запроса дашборда
-- ============================================

-- ЗАПРОС 1: Проверка диапазона дат
-- Логика из useDashboardData: startDate = '2026-01-01', endDate = '2026-01-31'
SELECT 
    'Date range check' as check_type,
    '2026-01-01' as start_date,
    '2026-01-31' as end_date,
    '2026-01-29' as test_date,
    CASE 
        WHEN '2026-01-29' >= '2026-01-01' AND '2026-01-29' <= '2026-01-31' 
        THEN 'YES - should be included'
        ELSE 'NO - will be excluded'
    END as should_be_included;

-- ============================================
-- ЗАПРОС 2: Проверка конкретной записи от 29.01.2026
-- ============================================
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name,
    CASE 
        WHEN a.date >= '2026-01-01' AND a.date <= '2026-01-31' 
        THEN 'YES - in range'
        ELSE 'NO - out of range'
    END as in_query_range,
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount,
    CASE 
        WHEN (a.value IS NOT NULL AND a.value > 0) OR (a.charged_amount > 0) 
        THEN 'YES - will display'
        ELSE 'NO - amount is 0'
    END as will_display
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND a.date = '2026-01-29';

-- ============================================
-- ЗАПРОС 3: Все записи attendance за январь 2026 для этого enrollment
-- ============================================
SELECT 
    a.id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount,
    CASE 
        WHEN (a.value IS NOT NULL AND a.value > 0) OR (a.charged_amount > 0) 
        THEN 'YES'
        ELSE 'NO'
    END as will_display
FROM attendance a
WHERE a.enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND a.date >= '2026-01-01'
  AND a.date <= '2026-01-31'
ORDER BY a.date;

-- ============================================
-- ЗАПРОС 4: Проверка enrollment в списке enrollments
-- ============================================
SELECT 
    e.id as enrollment_id,
    e.student_id,
    e.activity_id,
    e.is_active,
    s.full_name as student_name,
    act.name as activity_name,
    act.category,
    'Should be in dashboard' as status
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE e.id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90';

-- ============================================
-- ЗАПРОС 5: Сравнение записи от 29.01 с записью от 21.01
-- ============================================
SELECT 
    '2026-01-29' as date_to_check,
    COUNT(*) as attendance_records_count,
    MAX(charged_amount) as max_charged_amount,
    MAX(value) as max_value,
    CASE 
        WHEN MAX(value) IS NOT NULL AND MAX(value) > 0 THEN MAX(value)
        ELSE COALESCE(MAX(charged_amount), 0)
    END as calculated_amount
FROM attendance
WHERE enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND date = '2026-01-29'

UNION ALL

SELECT 
    '2026-01-21' as date_to_check,
    COUNT(*) as attendance_records_count,
    MAX(charged_amount) as max_charged_amount,
    MAX(value) as max_value,
    CASE 
        WHEN MAX(value) IS NOT NULL AND MAX(value) > 0 THEN MAX(value)
        ELSE COALESCE(MAX(charged_amount), 0)
    END as calculated_amount
FROM attendance
WHERE enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND date = '2026-01-21';

-- ============================================
-- ЗАПРОС 6: Проверка часовых поясов и формата даты
-- ============================================
SELECT 
    a.id,
    a.date as date_column,
    a.date::text as date_as_text,
    a.date::date as date_as_date_type,
    CURRENT_DATE as current_date_db,
    a.date = CURRENT_DATE as is_today,
    a.date > CURRENT_DATE as is_future,
    a.date < CURRENT_DATE as is_past
FROM attendance a
WHERE a.enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND a.date IN ('2026-01-29', '2026-01-21', '2026-01-14')
ORDER BY a.date;
