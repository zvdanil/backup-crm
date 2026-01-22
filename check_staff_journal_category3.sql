-- ============================================
-- КАТЕГОРИЯ 3: Ручные записи без связи
-- ============================================
-- 174 записи

SELECT 
    sje.id,
    s.full_name as педагог,
    s.position as должность,
    COALESCE(a.name, gl.name, 'Нет связи') as активность,
    CASE 
        WHEN sje.activity_id IS NULL AND sje.group_lesson_id IS NULL THEN 'Нет активности и группового занятия'
        WHEN sje.activity_id IS NOT NULL AND a.id IS NULL THEN 'Активность не существует'
        WHEN sje.group_lesson_id IS NOT NULL AND gl.id IS NULL THEN 'Групповое занятие не существует'
        ELSE 'Неизвестная причина'
    END as причина_проблемы,
    sje.date as дата,
    sje.amount as сумма,
    sje.base_amount as базовая_сумма,
    sje.is_manual_override as ручная_запись,
    sje.notes as примечания,
    sje.created_at as создано,
    sje.updated_at as обновлено
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
ORDER BY sje.date DESC, s.full_name;
