-- ============================================
-- КАТЕГОРИЯ 1: Записи без посещаемости (activity)
-- ============================================
-- 30 записей

SELECT 
    sje.id,
    s.full_name as педагог,
    s.position as должность,
    a.name as активность,
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
       AND att.date = sje.date) as посещаемость_на_дату,
    sje.created_at as создано,
    sje.updated_at as обновлено
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
ORDER BY sje.date DESC, s.full_name;
