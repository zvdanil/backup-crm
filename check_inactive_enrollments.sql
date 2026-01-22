-- ============================================
-- Полная проверка неактивных записей с посещаемостью
-- ============================================
-- Этот запрос покажет все неактивные записи, которые отображаются в интерфейсе

-- Все неактивные записи с посещаемостью
SELECT 
    e.id,
    e.is_active,
    e.unenrolled_at,
    COUNT(DISTINCT a.id) as attendance_count,
    SUM(CASE WHEN a.charged_amount > 0 THEN 1 ELSE 0 END) as attendance_with_charges,
    s.full_name as student_name,
    s.status as student_status,
    act.name as activity_name,
    act.is_active as activity_is_active,
    e.created_at,
    e.enrolled_at
FROM public.enrollments e
LEFT JOIN public.students s ON s.id = e.student_id
LEFT JOIN public.activities act ON act.id = e.activity_id
LEFT JOIN public.attendance a ON a.enrollment_id = e.id
WHERE e.is_active = false
GROUP BY 
    e.id, 
    e.is_active, 
    e.unenrolled_at,
    s.full_name,
    s.status,
    act.name,
    act.is_active,
    e.created_at,
    e.enrolled_at
HAVING COUNT(DISTINCT a.id) > 0
ORDER BY attendance_count DESC, e.unenrolled_at DESC;

-- Дополнительно: неактивные записи БЕЗ посещаемости (можно безопасно удалить)
SELECT 
    e.id,
    e.is_active,
    e.unenrolled_at,
    s.full_name as student_name,
    s.status as student_status,
    act.name as activity_name,
    act.is_active as activity_is_active,
    e.created_at,
    e.enrolled_at
FROM public.enrollments e
LEFT JOIN public.students s ON s.id = e.student_id
LEFT JOIN public.activities act ON act.id = e.activity_id
WHERE e.is_active = false
  AND e.id NOT IN (
    SELECT DISTINCT enrollment_id 
    FROM public.attendance 
    WHERE enrollment_id IS NOT NULL
  )
ORDER BY e.unenrolled_at DESC;
