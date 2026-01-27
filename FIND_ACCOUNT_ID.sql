-- ============================================
-- Найти account_id для счёта "ФОП 3"
-- ============================================

-- Проверить все счета
SELECT 
  id,
  name,
  description,
  is_active
FROM payment_accounts
ORDER BY name;

-- Найти счёт с похожим названием
SELECT 
  id,
  name,
  description,
  is_active
FROM payment_accounts
WHERE name LIKE '%ФОП%' OR name LIKE '%3%';
