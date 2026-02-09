-- Ищем ВСЕ активности с кастомными статусами
SELECT 
  id,
  name,
  billing_rules->'custom_statuses' as custom_statuses
FROM public.activities
WHERE billing_rules->'custom_statuses' IS NOT NULL
  AND jsonb_array_length(billing_rules->'custom_statuses') > 0
ORDER BY name;

-- Ищем активность где есть attendance с этим UUID
SELECT DISTINCT
  act.id,
  act.name,
  act.billing_rules->'custom_statuses' as custom_statuses
FROM public.activities act
JOIN public.enrollments e ON e.activity_id = act.id
JOIN public.attendance a ON a.enrollment_id = e.id
WHERE a.status = 'f26dbd57-b13f-4ba0-81bf-c7abb4e14f34'
LIMIT 5;
