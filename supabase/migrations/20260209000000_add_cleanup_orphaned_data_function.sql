-- ============================================
-- Функция автоматической очистки "мусорных" данных
-- ============================================
-- Эта функция может быть вызвана периодически для автоматической очистки
-- или использована в триггерах для предотвращения появления "мусорных" данных

-- Функция для очистки всех "мусорных" записей
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_data()
RETURNS TABLE(
    table_name TEXT,
    deleted_count BIGINT
) AS $$
DECLARE
    v_count BIGINT;
BEGIN
    -- Очистка attendance с несуществующими enrollments
    DELETE FROM public.attendance
    WHERE enrollment_id NOT IN (SELECT id FROM public.enrollments);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'attendance (orphaned enrollments)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка attendance с несуществующими group_lessons
    DELETE FROM public.attendance
    WHERE group_lesson_id IS NOT NULL 
      AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'attendance (orphaned group_lessons)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка enrollments с несуществующими students
    DELETE FROM public.enrollments
    WHERE student_id NOT IN (SELECT id FROM public.students);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'enrollments (orphaned students)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка enrollments с несуществующими activities
    DELETE FROM public.enrollments
    WHERE activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'enrollments (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка finance_transactions с несуществующими связями
    DELETE FROM public.finance_transactions
    WHERE student_id IS NOT NULL 
      AND student_id NOT IN (SELECT id FROM public.students);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'finance_transactions (orphaned students)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.finance_transactions
    WHERE activity_id IS NOT NULL 
      AND activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'finance_transactions (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.finance_transactions
    WHERE staff_id IS NOT NULL 
      AND staff_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'finance_transactions (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка staff_journal_entries
    DELETE FROM public.staff_journal_entries
    WHERE staff_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_journal_entries (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.staff_journal_entries
    WHERE activity_id IS NOT NULL 
      AND activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_journal_entries (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.staff_journal_entries
    WHERE group_lesson_id IS NOT NULL 
      AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_journal_entries (orphaned group_lessons)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка staff_billing_rules
    DELETE FROM public.staff_billing_rules
    WHERE staff_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_billing_rules (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.staff_billing_rules
    WHERE activity_id IS NOT NULL 
      AND activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_billing_rules (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.staff_billing_rules
    WHERE group_lesson_id IS NOT NULL 
      AND group_lesson_id NOT IN (SELECT id FROM public.group_lessons);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_billing_rules (orphaned group_lessons)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка group_lesson_sessions
    DELETE FROM public.group_lesson_sessions
    WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'group_lesson_sessions (orphaned group_lessons)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка group_lessons
    DELETE FROM public.group_lessons
    WHERE activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'group_lessons (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка group_lesson_staff
    DELETE FROM public.group_lesson_staff
    WHERE group_lesson_id NOT IN (SELECT id FROM public.group_lessons);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'group_lesson_staff (orphaned group_lessons)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.group_lesson_staff
    WHERE staff_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'group_lesson_staff (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка activity_teacher_history
    DELETE FROM public.activity_teacher_history
    WHERE activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'activity_teacher_history (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    DELETE FROM public.activity_teacher_history
    WHERE teacher_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'activity_teacher_history (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка activity_price_history
    DELETE FROM public.activity_price_history
    WHERE activity_id NOT IN (SELECT id FROM public.activities);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'activity_price_history (orphaned activities)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Очистка staff_payouts
    DELETE FROM public.staff_payouts
    WHERE staff_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'staff_payouts (orphaned staff)';
    deleted_count := v_count;
    RETURN NEXT;

    -- Обнуление teacher_id в enrollments
    UPDATE public.enrollments
    SET teacher_id = NULL
    WHERE teacher_id IS NOT NULL 
      AND teacher_id NOT IN (SELECT id FROM public.staff);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    table_name := 'enrollments (orphaned teacher_id updated)';
    deleted_count := v_count;
    RETURN NEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарий к функции
COMMENT ON FUNCTION public.cleanup_orphaned_data() IS 
'Очищает все "мусорные" записи из БД - записи, которые ссылаются на несуществующие данные. Возвращает таблицу с количеством удаленных записей по каждой категории.';

-- Пример использования:
-- SELECT * FROM public.cleanup_orphaned_data();
