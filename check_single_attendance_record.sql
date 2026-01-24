-- Проверка конкретной записи от 29.01.2026
-- Этот запрос проверяет, попадает ли запись в результаты запроса дашборда

SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category,
    -- Проверяем, попадает ли в диапазон запроса дашборда для января 2026
    CASE 
        WHEN a.date >= '2026-01-01' AND a.date <= '2026-01-31' 
        THEN 'YES - in range'
        ELSE 'NO - out of range'
    END as in_query_range,
    -- Что будет использовано в дашборде (логика из attendanceMap)
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount_for_dashboard,
    -- Будет ли отображаться (логика из amountsByDate)
    CASE 
        WHEN (a.value IS NOT NULL AND a.value > 0) OR (a.charged_amount > 0) 
        THEN 'YES - will display'
        ELSE 'NO - amount is 0'
    END as will_display,
    -- Проверка enrollment
    e.is_active as enrollment_is_active,
    e.student_id,
    e.activity_id
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.enrollment_id = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90'
  AND a.date = '2026-01-29';
