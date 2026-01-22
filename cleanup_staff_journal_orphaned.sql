-- ============================================
-- Очистка "мусорных" записей из staff_journal_entries
-- ============================================
-- Удаляет записи, которые не имеют соответствующих записей посещаемости
-- 
-- ВНИМАНИЕ: Перед выполнением сделайте бэкап!
-- Выполните сначала check_staff_journal_orphaned.sql для проверки

-- ============================================
-- 1. Удалить записи с активностями, для которых нет посещаемости
-- ============================================
-- Эти записи были созданы автоматически или вручную, но посещаемость была удалена
DELETE FROM public.staff_journal_entries
WHERE activity_id IS NOT NULL
  AND NOT EXISTS (
      -- Проверяем, есть ли посещаемость для этой активности и даты
      SELECT 1
      FROM public.attendance att
      INNER JOIN public.enrollments e ON e.id = att.enrollment_id
      WHERE e.activity_id = staff_journal_entries.activity_id
        AND att.date = staff_journal_entries.date
        AND (staff_journal_entries.group_lesson_id IS NULL OR att.group_lesson_id = staff_journal_entries.group_lesson_id)
  );

-- ============================================
-- 2. Удалить записи с групповыми занятиями, для которых нет сессий
-- ============================================
-- Эти записи были созданы для групповых занятий, но сессии были удалены
DELETE FROM public.staff_journal_entries
WHERE group_lesson_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.group_lesson_sessions gls
      WHERE gls.group_lesson_id = staff_journal_entries.group_lesson_id
        AND gls.session_date = staff_journal_entries.date
  );

-- ============================================
-- 3. Удалить ручные записи без связи с данными
-- ============================================
-- Ручные записи, которые не связаны ни с активностью, ни с групповым занятием
-- Или связаны с несуществующими активностями/занятиями
DELETE FROM public.staff_journal_entries
WHERE is_manual_override = true
  AND (
      -- Нет активности И нет группового занятия
      (activity_id IS NULL AND group_lesson_id IS NULL)
      OR
      -- Активность не существует
      (activity_id IS NOT NULL AND activity_id NOT IN (SELECT id FROM public.activities))
      OR
      -- Групповое занятие не существует
      (group_lesson_id IS NOT NULL AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons))
  );

-- ============================================
-- ИТОГОВАЯ СТАТИСТИКА
-- ============================================
-- После выполнения можно проверить результаты:
-- SELECT COUNT(*) FROM public.staff_journal_entries;
