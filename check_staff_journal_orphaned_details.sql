-- ============================================
-- ДЕТАЛЬНЫЙ ЗАПРОС: Все "мусорные" записи с полной информацией
-- ============================================
-- Этот запрос показывает все проблемные записи с деталями в одном месте

SELECT 
    'Записи без посещаемости (activity)' as issue_type,
    sje.id,
    sje.staff_id,
    s.staff_name as педагог,
    s.staff_position as должность,
    sje.activity_id,
    a.activity_name as активность,
    a.is_active as активность_активна,
    sje.group_lesson_id,
    gl.group_lesson_name as групповое_занятие,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    sje.created_at as создано,
    sje.updated_at as обновлено,
    (SELECT COUNT(*) 
     FROM public.enrollments e
     WHERE e.activity_id = sje.activity_id
       AND e.is_active = true) as активных_записей,
    (SELECT COUNT(*) 
     FROM public.attendance att
     INNER JOIN public.enrollments e ON e.id = att.enrollment_id
     WHERE e.activity_id = sje.activity_id
       AND att.date = sje.date
       AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)) as посещаемость_на_дату
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
    s.staff_name as педагог,
    s.staff_position as должность,
    sje.activity_id,
    a.activity_name as активность,
    a.is_active as активность_активна,
    sje.group_lesson_id,
    gl.group_lesson_name as групповое_занятие,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    sje.created_at as создано,
    sje.updated_at as обновлено,
    NULL::bigint as активных_записей,
    (SELECT COUNT(*) 
     FROM public.group_lesson_sessions gls
     WHERE gls.group_lesson_id = sje.group_lesson_id
       AND gls.session_date = sje.date) as посещаемость_на_дату
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
    s.staff_name as педагог,
    s.staff_position as должность,
    sje.activity_id,
    a.activity_name as активность,
    a.is_active as активность_активна,
    sje.group_lesson_id,
    gl.group_lesson_name as групповое_занятие,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    sje.created_at as создано,
    sje.updated_at as обновлено,
    NULL::bigint as активных_записей,
    NULL::bigint as посещаемость_на_дату
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

ORDER BY issue_type, дата DESC, педагог;
