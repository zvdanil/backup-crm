-- Смотрим billing_rules активности "Футбол"
SELECT 
  name,
  billing_rules->'custom_statuses' as custom_statuses
FROM public.activities
WHERE id = 'ac90aa1c-34b3-4094-b283-dafa413de938';

-- Находим кастомный статус по его UUID
SELECT 
  name,
  jsonb_array_elements(billing_rules->'custom_statuses') as custom_status
FROM public.activities
WHERE id = 'ac90aa1c-34b3-4094-b283-dafa413de938';
