-- ============================================
-- Очистка "мусорных" данных из БД
-- ============================================
-- Этот скрипт удаляет записи, которые не имеют связи с существующими данными
-- Выполните в Supabase SQL Editor
-- 
-- ВНИМАНИЕ: Перед выполнением рекомендуется сделать бэкап БД!

-- ============================================
-- 1. Очистка attendance с несуществующими enrollments
-- ============================================
-- Удаляем записи посещаемости, которые ссылаются на несуществующие записи
DELETE FROM public.attendance
WHERE enrollment_id NOT IN (SELECT id FROM public.enrollments);

-- ============================================
-- 2. Очистка attendance с несуществующими group_lessons
-- ============================================
-- Удаляем записи посещаемости с несуществующими групповыми занятиями
DELETE FROM public.attendance
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 3. Очистка enrollments с несуществующими students
-- ============================================
-- Удаляем записи, которые ссылаются на несуществующих студентов
DELETE FROM public.enrollments
WHERE student_id NOT IN (SELECT id FROM public.students);

-- ============================================
-- 4. Очистка enrollments с несуществующими activities
-- ============================================
-- Удаляем записи, которые ссылаются на несуществующие активности
DELETE FROM public.enrollments
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 5. Очистка finance_transactions с несуществующими связями
-- ============================================
-- Удаляем транзакции с несуществующими студентами (где student_id не NULL, но студента нет)
DELETE FROM public.finance_transactions
WHERE student_id IS NOT NULL 
  AND student_id NOT IN (SELECT id FROM public.students);

-- Удаляем транзакции с несуществующими активностями
DELETE FROM public.finance_transactions
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities);

-- Удаляем транзакции с несуществующими сотрудниками
DELETE FROM public.finance_transactions
WHERE staff_id IS NOT NULL 
  AND staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 6. Очистка staff_journal_entries с несуществующими связями
-- ============================================
-- Удаляем записи журнала с несуществующими сотрудниками
DELETE FROM public.staff_journal_entries
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- Удаляем записи журнала с несуществующими активностями (где activity_id не NULL)
DELETE FROM public.staff_journal_entries
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities);

-- Удаляем записи журнала с несуществующими групповыми занятиями
DELETE FROM public.staff_journal_entries
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 7. Очистка staff_billing_rules с несуществующими связями
-- ============================================
-- Удаляем правила с несуществующими сотрудниками
DELETE FROM public.staff_billing_rules
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- Удаляем правила с несуществующими активностями (где activity_id не NULL)
DELETE FROM public.staff_billing_rules
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities);

-- Удаляем правила с несуществующими групповыми занятиями
DELETE FROM public.staff_billing_rules
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 8. Очистка group_lesson_sessions с несуществующими group_lessons
-- ============================================
-- Удаляем сессии с несуществующими групповыми занятиями
DELETE FROM public.group_lesson_sessions
WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 9. Очистка group_lessons с несуществующими activities
-- ============================================
-- Удаляем групповые занятия с несуществующими активностями
DELETE FROM public.group_lessons
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 10. Очистка group_lesson_staff с несуществующими связями
-- ============================================
-- Удаляем связи с несуществующими групповыми занятиями
DELETE FROM public.group_lesson_staff
WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- Удаляем связи с несуществующими сотрудниками
DELETE FROM public.group_lesson_staff
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 11. Очистка activity_teacher_history с несуществующими связями
-- ============================================
-- Удаляем историю с несуществующими активностями
DELETE FROM public.activity_teacher_history
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- Удаляем историю с несуществующими сотрудниками
DELETE FROM public.activity_teacher_history
WHERE teacher_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 12. Очистка activity_price_history с несуществующими activities
-- ============================================
-- Удаляем историю цен с несуществующими активностями
DELETE FROM public.activity_price_history
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 13. Очистка staff_payouts с несуществующими сотрудниками
-- ============================================
-- Удаляем выплаты с несуществующими сотрудниками
DELETE FROM public.staff_payouts
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 14. Очистка enrollments с несуществующими teacher_id
-- ============================================
-- Обнуляем teacher_id для записей с несуществующими преподавателями
UPDATE public.enrollments
SET teacher_id = NULL
WHERE teacher_id IS NOT NULL 
  AND teacher_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- ИТОГОВАЯ СТАТИСТИКА
-- ============================================
-- После выполнения скрипта можно проверить результаты:
-- SELECT 'attendance' as table_name, COUNT(*) as orphaned_count FROM public.attendance WHERE enrollment_id NOT IN (SELECT id FROM public.enrollments);
-- SELECT 'enrollments' as table_name, COUNT(*) as orphaned_count FROM public.enrollments WHERE student_id NOT IN (SELECT id FROM public.students) OR activity_id NOT IN (SELECT id FROM public.activities);
-- и т.д.
