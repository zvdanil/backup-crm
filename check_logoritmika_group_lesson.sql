-- ============================================
-- Проверка группового занятия "Логорітміка (янголята)"
-- ============================================

-- 1. Найти активность "Логорітміка"
SELECT 
    id,
    name,
    is_active
FROM public.activities
WHERE name LIKE '%Логорітміка%'
ORDER BY name;

-- 2. Найти групповые занятия для этой активности
SELECT 
    gl.id,
    gl.name,
    gl.activity_id,
    a.name as activity_name
FROM public.group_lessons gl
LEFT JOIN public.activities a ON a.id = gl.activity_id
WHERE a.name LIKE '%Логорітміка%'
ORDER BY gl.name;

-- 3. Проверить сессии для группового занятия "Логорітмика (янголята)" на проблемные даты
SELECT 
    gls.id,
    gls.group_lesson_id,
    gl.name as group_lesson_name,
    gls.session_date,
    gls.sessions_count
FROM public.group_lesson_sessions gls
INNER JOIN public.group_lessons gl ON gl.id = gls.group_lesson_id
WHERE gl.name LIKE '%Логорітмика%янголята%'
  AND gls.session_date IN ('2026-01-21', '2026-01-16', '2026-01-14', '2026-01-09', '2026-01-07')
ORDER BY gls.session_date;

-- 4. Проверить, есть ли staff_journal_entries с правильным group_lesson_id для этих дат
SELECT 
    sje.id,
    sje.staff_id,
    s.full_name as педагог,
    sje.group_lesson_id,
    gl.name as group_lesson_name,
    sje.date,
    sje.amount,
    sje.is_manual_override
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.group_lessons gl ON gl.id = sje.group_lesson_id
WHERE sje.staff_id = 'b3717128-5083-4e08-8197-4e872152cc0d'  -- Тарасова Ольга Анатоліївна
  AND sje.date IN ('2026-01-21', '2026-01-16', '2026-01-14', '2026-01-09', '2026-01-07')
  AND sje.group_lesson_id IS NOT NULL
ORDER BY sje.date;
