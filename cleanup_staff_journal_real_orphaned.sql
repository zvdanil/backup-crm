-- ============================================
-- ОЧИСТКА реальных "мусорных" записей
-- ============================================
-- ВНИМАНИЕ: Этот скрипт удалит только реально проблемные записи
-- Ручные записи без связи с активностями НЕ будут удалены (это нормально)

BEGIN;

-- ============================================
-- 1. Удаление записей с активностями (БЕЗ групповых занятий), для которых нет посещаемости
-- ============================================
DELETE FROM public.staff_journal_entries sje
WHERE sje.activity_id IS NOT NULL
  AND sje.group_lesson_id IS NULL
  AND sje.is_manual_override = false
  AND NOT EXISTS (
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = sje.activity_id
        AND att.date = sje.date
  );

-- Показать количество удаленных записей
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Удалено записей без посещаемости (activity): %', deleted_count;
END $$;

-- ============================================
-- 2. Удаление записей с групповыми занятиями, для которых нет сессий
-- ============================================
DELETE FROM public.staff_journal_entries sje
WHERE sje.group_lesson_id IS NOT NULL
  AND sje.is_manual_override = false
  AND NOT EXISTS (
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = sje.group_lesson_id
        AND gls.session_date = sje.date
  );

-- Показать количество удаленных записей
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Удалено записей без сессий (group_lesson): %', deleted_count;
END $$;

-- ============================================
-- 3. Удаление записей с несуществующими активностями или групповыми занятиями
-- ============================================
DELETE FROM public.staff_journal_entries sje
WHERE (
    (sje.activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.id = sje.activity_id))
    OR
    (sje.group_lesson_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.group_lessons gl WHERE gl.id = sje.group_lesson_id))
);

-- Показать количество удаленных записей
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Удалено записей с несуществующими связями: %', deleted_count;
END $$;

COMMIT;

-- ============================================
-- ИТОГОВАЯ СТАТИСТИКА
-- ============================================
SELECT 
    'Всего записей осталось' as статус,
    COUNT(*) as количество
FROM public.staff_journal_entries;
