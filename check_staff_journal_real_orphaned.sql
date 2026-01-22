-- ============================================
-- РЕАЛЬНЫЕ "мусорные" записи в staff_journal_entries
-- ============================================
-- Только те записи, которые действительно являются проблемными:
-- 1. Записи с активностями (без групповых занятий), для которых нет посещаемости
-- 2. Записи с групповыми занятиями, для которых нет сессий
-- 3. Записи с несуществующими активностями или групповыми занятиями
-- 
-- НЕ включаются:
-- - Ручные записи без связи с активностями (это нормально для оплаты персонала)

-- ============================================
-- 1. Записи с активностями (БЕЗ групповых занятий), для которых нет посещаемости
-- ============================================
SELECT 
    'Записи без посещаемости (activity, не групповые)' as issue_type,
    sje.id,
    s.full_name as педагог,
    s.position as должность,
    a.name as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    (SELECT COUNT(*) 
     FROM public.enrollments e
     WHERE e.activity_id = sje.activity_id
       AND e.is_active = true) as активных_записей,
    (SELECT COUNT(*) 
     FROM public.attendance att
     INNER JOIN public.enrollments e ON e.id = att.enrollment_id
     WHERE e.activity_id = sje.activity_id
       AND att.date = sje.date) as посещаемость_на_дату,
    sje.created_at as создано
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.activities a ON a.id = sje.activity_id
WHERE sje.activity_id IS NOT NULL
  AND sje.group_lesson_id IS NULL  -- Только записи БЕЗ групповых занятий
  AND sje.is_manual_override = false  -- Только автоматические записи
  AND NOT EXISTS (
      -- Проверяем, есть ли посещаемость для этой активности и даты
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = sje.activity_id
        AND att.date = sje.date
  )

UNION ALL

-- ============================================
-- 2. Записи с групповыми занятиями, для которых нет сессий
-- ============================================
SELECT 
    'Записи без сессий (group_lesson)' as issue_type,
    sje.id,
    s.full_name as педагог,
    s.position as должность,
    gl.name as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    NULL::bigint as активных_записей,
    (SELECT COUNT(*) 
     FROM public.group_lesson_sessions gls
     WHERE gls.group_lesson_id = sje.group_lesson_id
       AND gls.session_date = sje.date) as посещаемость_на_дату,
    sje.created_at as создано
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.group_lessons gl ON gl.id = sje.group_lesson_id
WHERE sje.group_lesson_id IS NOT NULL
  AND sje.is_manual_override = false  -- Только автоматические записи
  AND NOT EXISTS (
      -- Проверяем, есть ли сессия для этого группового занятия и даты
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = sje.group_lesson_id
        AND gls.session_date = sje.date
  )

UNION ALL

-- ============================================
-- 3. Записи с несуществующими активностями или групповыми занятиями
-- ============================================
SELECT 
    'Записи с несуществующими связями' as issue_type,
    sje.id,
    s.full_name as педагог,
    s.position as должность,
    COALESCE(a.name, gl.name, 'Нет связи') as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    NULL::bigint as активных_записей,
    NULL::bigint as посещаемость_на_дату,
    sje.created_at as создано
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.activities a ON a.id = sje.activity_id
LEFT JOIN public.group_lessons gl ON gl.id = sje.group_lesson_id
WHERE (
    -- Активность указана, но не существует
    (sje.activity_id IS NOT NULL AND a.id IS NULL)
    OR
    -- Групповое занятие указано, но не существует
    (sje.group_lesson_id IS NOT NULL AND gl.id IS NULL)
)

ORDER BY issue_type, дата DESC, педагог;
