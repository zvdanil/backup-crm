-- ============================================
-- Проверка "мусорных" записей в staff_journal_entries
-- ============================================
-- Записи, которые отображаются в финансовой истории педагога,
-- но не имеют соответствующих записей посещаемости

-- ============================================
-- 1. Записи с активностями, для которых нет посещаемости в эту дату
-- ============================================
SELECT 
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.activity_id,
    a.activity_name,
    a.is_active as activity_is_active,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.group_lesson_id,
    gl.group_lesson_name,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    -- Дополнительная информация
    (SELECT COUNT(*) 
     FROM public.enrollments e
     WHERE e.activity_id = sje.activity_id
       AND e.is_active = true) as active_enrollments_count,
    (SELECT COUNT(*) 
     FROM public.attendance att
     INNER JOIN public.enrollments e ON e.id = att.enrollment_id
     WHERE e.activity_id = sje.activity_id
       AND att.date = sje.date
       AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)) as attendance_count_for_date,
    -- Проверка наличия посещаемости
    CASE 
        WHEN sje.activity_id IS NOT NULL THEN
            (SELECT COUNT(*) 
             FROM public.attendance att
             INNER JOIN public.enrollments e ON e.id = att.enrollment_id
             WHERE e.activity_id = sje.activity_id
               AND att.date = sje.date
               AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id))
        ELSE 0
    END as attendance_count
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as activity_name, is_active FROM public.activities
) a ON a.id = sje.activity_id
LEFT JOIN (
    SELECT id, name as group_lesson_name FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
WHERE sje.activity_id IS NOT NULL
  AND NOT EXISTS (
      -- Проверяем, есть ли посещаемость для этой активности и даты
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = sje.activity_id
        AND att.date = sje.date
        AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)
  )
ORDER BY sje.date DESC, s.staff_name;

-- ============================================
-- 2. Записи с групповыми занятиями, для которых нет сессий
-- ============================================
SELECT 
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.group_lesson_id,
    gl.group_lesson_name,
    gl.activity_id as group_lesson_activity_id,
    a.activity_name as group_lesson_activity_name,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    -- Проверка наличия сессии
    (SELECT COUNT(*) 
     FROM public.group_lesson_sessions gls
     WHERE gls.group_lesson_id = sje.group_lesson_id
       AND gls.session_date = sje.date) as session_count,
    -- Всего сессий для этого группового занятия
    (SELECT COUNT(*) 
     FROM public.group_lesson_sessions gls
     WHERE gls.group_lesson_id = sje.group_lesson_id) as total_sessions_count
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as group_lesson_name, activity_id FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
LEFT JOIN (
    SELECT id, name as activity_name FROM public.activities
) a ON a.id = gl.activity_id
WHERE sje.group_lesson_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = sje.group_lesson_id
        AND gls.session_date = sje.date
  )
ORDER BY sje.date DESC, s.staff_name;

-- ============================================
-- 3. Ручные записи (is_manual_override = true) без связи с данными
-- ============================================
SELECT 
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.activity_id,
    a.activity_name,
    a.is_active as activity_is_active,
    sje.group_lesson_id,
    gl.group_lesson_name,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    -- Причина проблемы
    CASE 
        WHEN sje.activity_id IS NULL AND sje.group_lesson_id IS NULL THEN 'Нет активности и группового занятия'
        WHEN sje.activity_id IS NOT NULL AND a.activity_name IS NULL THEN 'Активность не существует'
        WHEN sje.group_lesson_id IS NOT NULL AND gl.group_lesson_name IS NULL THEN 'Групповое занятие не существует'
        ELSE 'Неизвестная причина'
    END as issue_reason
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as activity_name, is_active FROM public.activities
) a ON a.id = sje.activity_id
LEFT JOIN (
    SELECT id, name as group_lesson_name FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
WHERE sje.is_manual_override = true
  AND (
      -- Нет активности И нет группового занятия
      (sje.activity_id IS NULL AND sje.group_lesson_id IS NULL)
      OR
      -- Активность не существует
      (sje.activity_id IS NOT NULL AND a.activity_name IS NULL)
      OR
      -- Групповое занятие не существует
      (sje.group_lesson_id IS NOT NULL AND gl.group_lesson_name IS NULL)
  )
ORDER BY sje.date DESC, s.staff_name;

-- ============================================
-- 4. ОБЪЕДИНЕННЫЙ ЗАПРОС: Все детали в одном месте
-- ============================================
SELECT 
    'Записи без посещаемости (activity)' as issue_type,
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.activity_id,
    a.activity_name,
    a.is_active as activity_is_active,
    sje.group_lesson_id,
    gl.group_lesson_name,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    (SELECT COUNT(*) 
     FROM public.enrollments e
     WHERE e.activity_id = sje.activity_id
       AND e.is_active = true) as active_enrollments_count,
    (SELECT COUNT(*) 
     FROM public.attendance att
     INNER JOIN public.enrollments e ON e.id = att.enrollment_id
     WHERE e.activity_id = sje.activity_id
       AND att.date = sje.date
       AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)) as attendance_count_for_date
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as activity_name, is_active FROM public.activities
) a ON a.id = sje.activity_id
LEFT JOIN (
    SELECT id, name as group_lesson_name FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
WHERE sje.activity_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = sje.activity_id
        AND att.date = sje.date
        AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)
  )

UNION ALL

SELECT 
    'Записи без сессий (group_lesson)' as issue_type,
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.activity_id,
    a.activity_name,
    a.is_active as activity_is_active,
    sje.group_lesson_id,
    gl.group_lesson_name,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    NULL::bigint as active_enrollments_count,
    (SELECT COUNT(*) 
     FROM public.group_lesson_sessions gls
     WHERE gls.group_lesson_id = sje.group_lesson_id
       AND gls.session_date = sje.date) as attendance_count_for_date
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as activity_name, is_active FROM public.activities
) a ON a.id = sje.activity_id
LEFT JOIN (
    SELECT id, name as group_lesson_name FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
WHERE sje.group_lesson_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = sje.group_lesson_id
        AND gls.session_date = sje.date
  )

UNION ALL

SELECT 
    'Ручные записи без связи' as issue_type,
    sje.id,
    sje.staff_id,
    s.staff_name,
    s.staff_position,
    sje.activity_id,
    a.activity_name,
    a.is_active as activity_is_active,
    sje.group_lesson_id,
    gl.group_lesson_name,
    sje.date,
    sje.amount,
    sje.base_amount,
    sje.is_manual_override,
    sje.notes,
    sje.created_at,
    sje.updated_at,
    NULL::bigint as active_enrollments_count,
    NULL::bigint as attendance_count_for_date
FROM public.staff_journal_entries sje
LEFT JOIN (
    SELECT id, full_name as staff_name, position as staff_position FROM public.staff
) s ON s.id = sje.staff_id
LEFT JOIN (
    SELECT id, name as activity_name, is_active FROM public.activities
) a ON a.id = sje.activity_id
LEFT JOIN (
    SELECT id, name as group_lesson_name FROM public.group_lessons
) gl ON gl.id = sje.group_lesson_id
WHERE sje.is_manual_override = true
  AND (
      (sje.activity_id IS NULL AND sje.group_lesson_id IS NULL)
      OR (sje.activity_id IS NOT NULL AND a.id IS NULL)
      OR (sje.group_lesson_id IS NOT NULL AND gl.id IS NULL)
  )

ORDER BY issue_type, date DESC, staff_name;

-- ============================================
-- 5. Сводная статистика (быстрый просмотр)
-- ============================================
SELECT 
    'Записи без посещаемости (activity)' as issue_type,
    COUNT(*) as count
FROM public.staff_journal_entries sje
WHERE sje.activity_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = sje.activity_id
        AND att.date = sje.date
        AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)
  )

UNION ALL

SELECT 
    'Записи без сессий (group_lesson)' as issue_type,
    COUNT(*) as count
FROM public.staff_journal_entries sje
WHERE sje.group_lesson_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = sje.group_lesson_id
        AND gls.session_date = sje.date
  )

UNION ALL

SELECT 
    'Ручные записи без связи' as issue_type,
    COUNT(*) as count
FROM public.staff_journal_entries sje
LEFT JOIN public.activities a ON a.id = sje.activity_id
LEFT JOIN public.group_lessons gl ON gl.id = sje.group_lesson_id
WHERE sje.is_manual_override = true
  AND (
      (sje.activity_id IS NULL AND sje.group_lesson_id IS NULL)
      OR (sje.activity_id IS NOT NULL AND a.id IS NULL)
      OR (sje.group_lesson_id IS NOT NULL AND gl.id IS NULL)
  );
