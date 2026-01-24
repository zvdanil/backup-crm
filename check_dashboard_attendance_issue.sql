-- Диагностика проблемы с отображением начислений в дашборде
-- Замените значения ниже на реальные данные из вашего случая

-- 1. Проверка записей attendance за последние дни (для поиска проблемной записи)
-- Найдите enrollment_id и date из вашего случая
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    a.manual_value_edit,
    a.created_at,
    a.updated_at,
    e.student_id,
    e.activity_id,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category,
    -- Проверяем логику дашборда: что будет использовано
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount_for_dashboard
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.date >= CURRENT_DATE - INTERVAL '7 days'  -- Последние 7 дней
ORDER BY a.date DESC, a.created_at DESC
LIMIT 50;

-- 2. Проверка конкретной записи (замените enrollment_id и date на ваши значения)
-- Пример: enrollment_id = 'ваш-enrollment-id', date = '2026-01-XX'
/*
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    a.manual_value_edit,
    e.student_id,
    e.activity_id,
    e.is_active as enrollment_is_active,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category,
    act.default_price,
    e.custom_price,
    e.discount_percent,
    -- Логика дашборда
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount_for_dashboard,
    -- Проверка: будет ли запись отображаться (amount !== 0)
    CASE 
        WHEN (a.value IS NOT NULL AND a.value > 0) OR (a.charged_amount > 0) THEN 'YES'
        ELSE 'NO - amount is 0'
    END as will_display_in_dashboard
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.enrollment_id = 'ВАШ-ENROLLMENT-ID'  -- Замените на реальный ID
  AND a.date = '2026-01-XX'  -- Замените на реальную дату
;
*/

-- 3. Проверка всех записей для активности "Логопед" за текущий месяц
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    a.manual_value_edit,
    s.full_name as student_name,
    act.name as activity_name,
    act.category as activity_category,
    -- Логика дашборда
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount_for_dashboard,
    -- Проверка отображения
    CASE 
        WHEN (a.value IS NOT NULL AND a.value > 0) OR (a.charged_amount > 0) THEN 'YES'
        ELSE 'NO - amount is 0'
    END as will_display_in_dashboard
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE act.name ILIKE '%логопед%'  -- Или точное название активности
  AND a.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND a.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
ORDER BY a.date DESC, s.full_name;

-- 4. Сравнение: есть ли запись в staff_journal_entries для той же даты (чтобы понять почему ЗП отображается)
SELECT 
    'attendance' as source,
    a.enrollment_id,
    a.date,
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as amount,
    s.full_name as student_name,
    act.name as activity_name
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.enrollment_id = 'ВАШ-ENROLLMENT-ID'  -- Замените
  AND a.date = '2026-01-XX'  -- Замените

UNION ALL

SELECT 
    'staff_journal' as source,
    NULL as enrollment_id,
    sje.date,
    sje.amount,
    st.full_name as student_name,
    COALESCE(act.name, 'Без активності') as activity_name
FROM staff_journal_entries sje
LEFT JOIN staff st ON st.id = sje.staff_id
LEFT JOIN activities act ON act.id = sje.activity_id
WHERE sje.date = '2026-01-XX'  -- Замените на ту же дату
  AND (sje.activity_id = 'ВАШ-ACTIVITY-ID' OR sje.activity_id IS NULL)  -- Замените на ID активности логопеда
ORDER BY date, source;

-- 5. Проверка: все записи attendance где value = 0 но charged_amount > 0 (потенциальная проблема)
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name,
    act.category,
    -- Что будет использовано в дашборде
    CASE 
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE COALESCE(a.charged_amount, 0)
    END as calculated_amount_for_dashboard,
    'PROBLEM: value=0 but charged_amount>0, will use value=0' as issue
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE a.value = 0 
  AND a.charged_amount > 0
  AND a.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND a.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
ORDER BY a.date DESC;

-- 6. Проверка: все записи attendance где и value и charged_amount = 0 (не будут отображаться)
SELECT 
    a.id,
    a.enrollment_id,
    a.date,
    a.status,
    a.charged_amount,
    a.value,
    s.full_name as student_name,
    act.name as activity_name,
    act.category,
    'WILL NOT DISPLAY: both value and charged_amount are 0' as issue
FROM attendance a
JOIN enrollments e ON e.id = a.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN activities act ON act.id = e.activity_id
WHERE COALESCE(a.value, 0) = 0 
  AND COALESCE(a.charged_amount, 0) = 0
  AND a.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND a.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
ORDER BY a.date DESC;
