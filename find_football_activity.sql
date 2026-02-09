-- Ищем активность с кастомным статусом f26dbd57-b13f-4ba0-81bf-c7abb4e14f34
SELECT 
  id,
  name,
  billing_rules->'custom_statuses' as custom_statuses
FROM public.activities
WHERE billing_rules->'custom_statuses' @> '[{"id": "f26dbd57-b13f-4ba0-81bf-c7abb4e14f34"}]'::jsonb;

-- Ищем активность "Футбол" по имени
SELECT 
  id,
  name,
  billing_rules->'custom_statuses' as custom_statuses
FROM public.activities
WHERE LOWER(name) LIKE '%футбол%' OR LOWER(name) LIKE '%soccer%';

-- Проверяем активность по ID которая была в логах
SELECT 
  id,
  name,
  payment_type,
  billing_rules
FROM public.activities
WHERE id = 'ac90aa1c-34b3-4094-b283-dafa413de938';
