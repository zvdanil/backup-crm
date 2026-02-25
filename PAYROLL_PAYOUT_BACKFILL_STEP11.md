# STEP 11: Backfill payouts and links

Цель: привести старые данные к новой архитектуре (`staff_payouts` canonical) без автоисправления неоднозначных случаев.

## Порядок запуска

1. Выполнить dry-run отчет:
   - `CHECK_PAYROLL_PAYOUT_BACKFILL_REPORT.sql`
2. Проверить блок `ambiguous_manual_review` (эти кейсы не исправляются автоматически).
3. Если отчет устраивает — выполнить apply:
   - `APPLY_PAYROLL_PAYOUT_BACKFILL.sql`
4. Повторно выполнить `CHECK_PAYROLL_PAYOUT_BACKFILL_REPORT.sql` и убедиться, что:
   - нет/минимум `total_missing_links`;
   - неоднозначные случаи остались только в отчете для ручной обработки.

## Что делает apply-скрипт

- Связывает payout с salary-транзакцией, если найден ровно один кандидат (`staff_id + payout_date + amount`).
- Создает производную salary-транзакцию, если кандидатов нет.
- Не трогает неоднозначные кейсы (2+ кандидата).
- Проставляет `expense_category_id` в `staff_payouts` из linked salary-транзакции, если у payout поле пустое.

## Важно

- Скрипт не вносит «умных» решений по неоднозначным случаям — только техотчет.
- Для подкатегории добавлена миграция:
  - `supabase/migrations/20260324000000_add_expense_category_id_to_staff_payouts.sql`
