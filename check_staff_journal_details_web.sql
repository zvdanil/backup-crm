-- ============================================
-- ДЕТАЛЬНЫЙ ЗАПРОС для веб-интерфейса Supabase
-- Все "мусорные" записи с полной информацией
-- ============================================
-- Выполните весь запрос (Ctrl+A, затем Run)

SELECT 
    'Записи без посещаемости (activity)' as issue_type,
    sje.id,
    s.staff_name as педагог,
    s.staff_position as должность,
    a.activity_name as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
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
       AND att.date = sje.date
       AND (sje.group_lesson_id IS NULL OR att.group_lesson_id = sje.group_lesson_id)) as посещаемость_на_дату,
    sje.created_at as создано
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.activities a ON a.id = sje.activity_id
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
    s.staff_name as педагог,
    s.staff_position as должность,
    gl.name as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
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
    s.staff_name as педагог,
    s.staff_position as должность,
    COALESCE(a.name, gl.name, 'Нет связи') as активность,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    NULL::bigint as активных_записей,
    NULL::bigint as посещаемость_на_дату,
    sje.created_at as создано
FROM public.staff_journal_entries sje
LEFT JOIN public.staff s ON s.id = sje.staff_id
LEFT JOIN public.activities a ON a.id = sje.activity_id
LEFT JOIN public.group_lessons gl ON gl.id = sje.group_lesson_id
WHERE sje.is_manual_override = true
  AND (
      (sje.activity_id IS NULL AND sje.group_lesson_id IS NULL)
      OR (sje.activity_id IS NOT NULL AND a.id IS NULL)
      OR (sje.group_lesson_id IS NOT NULL AND gl.id IS NULL)
  )

ORDER BY issue_type, дата DESC, педагог;
