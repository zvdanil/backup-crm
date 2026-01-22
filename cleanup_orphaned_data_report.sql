-- ============================================
-- Отчет о "мусорных" данных в БД
-- ============================================
-- Этот скрипт показывает количество записей, которые будут удалены
-- Выполните ПЕРЕД cleanup_orphaned_data.sql для проверки

-- ============================================
-- 1. Attendance с несуществующими enrollments
-- ============================================
SELECT 
    'attendance (orphaned enrollments)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.attendance
WHERE enrollment_id NOT IN (SELECT id FROM public.enrollments);

-- ============================================
-- 2. Attendance с несуществующими group_lessons
-- ============================================
SELECT 
    'attendance (orphaned group_lessons)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.attendance
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 3. Enrollments с несуществующими students
-- ============================================
SELECT 
    'enrollments (orphaned students)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.enrollments
WHERE student_id NOT IN (SELECT id FROM public.students);

-- ============================================
-- 4. Enrollments с несуществующими activities
-- ============================================
SELECT 
    'enrollments (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.enrollments
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 5. Finance_transactions с несуществующими связями
-- ============================================
SELECT 
    'finance_transactions (orphaned students)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.finance_transactions
WHERE student_id IS NOT NULL 
  AND student_id NOT IN (SELECT id FROM public.students)

UNION ALL

SELECT 
    'finance_transactions (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.finance_transactions
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities)

UNION ALL

SELECT 
    'finance_transactions (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.finance_transactions
WHERE staff_id IS NOT NULL 
  AND staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 6. Staff_journal_entries с несуществующими связями
-- ============================================
SELECT 
    'staff_journal_entries (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_journal_entries
WHERE staff_id NOT IN (SELECT id FROM public.staff)

UNION ALL

SELECT 
    'staff_journal_entries (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_journal_entries
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities)

UNION ALL

SELECT 
    'staff_journal_entries (orphaned group_lessons)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_journal_entries
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 7. Staff_billing_rules с несуществующими связями
-- ============================================
SELECT 
    'staff_billing_rules (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_billing_rules
WHERE staff_id NOT IN (SELECT id FROM public.staff)

UNION ALL

SELECT 
    'staff_billing_rules (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_billing_rules
WHERE activity_id IS NOT NULL 
  AND activity_id NOT IN (SELECT id FROM public.activities)

UNION ALL

SELECT 
    'staff_billing_rules (orphaned group_lessons)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_billing_rules
WHERE group_lesson_id IS NOT NULL 
  AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 8. Group_lesson_sessions с несуществующими group_lessons
-- ============================================
SELECT 
    'group_lesson_sessions (orphaned group_lessons)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.group_lesson_sessions
WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons);

-- ============================================
-- 9. Group_lessons с несуществующими activities
-- ============================================
SELECT 
    'group_lessons (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.group_lessons
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 10. Group_lesson_staff с несуществующими связями
-- ============================================
SELECT 
    'group_lesson_staff (orphaned group_lessons)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.group_lesson_staff
WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons)

UNION ALL

SELECT 
    'group_lesson_staff (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.group_lesson_staff
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 11. Activity_teacher_history с несуществующими связями
-- ============================================
SELECT 
    'activity_teacher_history (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.activity_teacher_history
WHERE activity_id NOT IN (SELECT id FROM public.activities)

UNION ALL

SELECT 
    'activity_teacher_history (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.activity_teacher_history
WHERE teacher_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 12. Activity_price_history с несуществующими activities
-- ============================================
SELECT 
    'activity_price_history (orphaned activities)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.activity_price_history
WHERE activity_id NOT IN (SELECT id FROM public.activities);

-- ============================================
-- 13. Staff_payouts с несуществующими сотрудниками
-- ============================================
SELECT 
    'staff_payouts (orphaned staff)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.staff_payouts
WHERE staff_id NOT IN (SELECT id FROM public.staff);

-- ============================================
-- 14. Enrollments с несуществующими teacher_id
-- ============================================
SELECT 
    'enrollments (orphaned teacher_id)' as issue_type,
    COUNT(*) as orphaned_count
FROM public.enrollments
WHERE teacher_id IS NOT NULL 
  AND teacher_id NOT IN (SELECT id FROM public.staff);
