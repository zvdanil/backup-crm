-- Проверка сохранения custom_statuses в БД
-- Замените 'YOUR_ACTIVITY_ID' на ID активности, где вы создали кастомный статус

-- 1. Проверка структуры billing_rules
SELECT 
  id,
  name,
  billing_rules,
  billing_rules::text as billing_rules_text,
  jsonb_typeof(billing_rules) as billing_rules_type,
  billing_rules ? 'custom_statuses' as has_custom_statuses_key,
  billing_rules->'custom_statuses' as custom_statuses_raw,
  jsonb_typeof(billing_rules->'custom_statuses') as custom_statuses_type,
  jsonb_array_length(billing_rules->'custom_statuses') as custom_statuses_length,
  billing_rules->'custom_statuses' as custom_statuses_array
FROM activities
WHERE id = 'YOUR_ACTIVITY_ID'; -- Замените на реальный ID

-- 2. Проверка всех активностей с custom_statuses
SELECT 
  id,
  name,
  billing_rules->'custom_statuses' as custom_statuses,
  jsonb_array_length(billing_rules->'custom_statuses') as custom_statuses_count
FROM activities
WHERE billing_rules ? 'custom_statuses'
  AND jsonb_array_length(billing_rules->'custom_statuses') > 0;
