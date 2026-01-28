-- ============================================
-- Пересчёт распределения авансов для Долінце Злата по рахунку ФОП З
-- Использует функцию public.rebuild_advance_distribution
-- ============================================

-- Проверяем, правильно ли выбраны студент и рахунок
SELECT 
  s.id AS student_id,
  s.full_name,
  pa.id AS account_id,
  pa.name AS account_name
FROM students s
JOIN payment_accounts pa ON pa.name = 'ФОП З'
WHERE s.full_name = 'Долінце Злата';

-- Пересчитываем распределение (ВНИМАНИЕ: удалит все advance_payment и пересчитает их заново)
SELECT public.rebuild_advance_distribution(
  '03f62f53-ae8e-4462-b718-d28d41560fe9'::uuid, -- Долінце Злата
  '2002f749-002a-4ff5-82be-62b5c67ae396'::uuid  -- ФОП З
);

-- Проверяем новый авансовый баланс
SELECT 
  ab.student_id,
  s.full_name,
  ab.account_id,
  pa.name AS account_name,
  ab.balance
FROM advance_balances ab
JOIN students s ON s.id = ab.student_id
JOIN payment_accounts pa ON pa.id = ab.account_id
WHERE ab.student_id = '03f62f53-ae8e-4462-b718-d28d41560fe9'
  AND ab.account_id = '2002f749-002a-4ff5-82be-62b5c67ae396';

