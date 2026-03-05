-- Оплати батьків за лютий 2026 — тільки рахунок ТОВ "Освітній простір "Ірис"

SELECT
  s.full_name AS "ФІО дитини",
  pa.name AS "Рахунок",
  ft.amount::numeric AS "Сума оплати",
  ft.date AS "Дата оплати"
FROM finance_transactions ft
JOIN payment_accounts pa ON pa.id = ft.account_id
JOIN students s ON s.id = ft.student_id
WHERE ft.type = 'payment'
  AND ft.date >= '2026-02-01'
  AND ft.date <= '2026-02-28'
  AND ft.transfer_id IS NULL
  AND pa.name = 'ТОВ "Освітній простір "Ірис"'
ORDER BY s.full_name, ft.date;
