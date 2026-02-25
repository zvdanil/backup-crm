# STEP 12 — Stabilization Report (Payroll Payout Unification)

## Что проверено

- Линтер по ключевым файлам унификации:
  - `src/pages/StaffDetail.tsx`
  - `src/pages/ActivityExpenseJournal.tsx`
  - `src/components/staff/PayrollPayoutDialog.tsx`
  - `src/hooks/useStaffBilling.ts`
  - `src/hooks/useFinanceTransactions.ts`
  - `src/lib/payrollPayoutWrite.ts`
  - `src/lib/payrollPayoutContract.ts`
- Результат: ошибок не обнаружено.

## Подтвержденные архитектурные условия

- Canonical источник выплат: `staff_payouts`.
- Производная запись для учета: `finance_transactions(type='salary')`.
- Единый create/update/delete путь реализован через `payrollPayoutWrite` и используется в payroll-flow.
- В `ActivityExpenseJournal` для категории `salary` отображение строится из `staff_payouts` (canonical rows), а не из merge двух независимых источников.
- Unified popup подключен в финансовой истории и в журнале затрат `Зарплата`.
- Контекстный prefill включен:
  - `financial-history`
  - `activity-expense-journal`
  - `staff-expense-journal` (без prefill сотрудника).

## Backfill

- Добавлены и исправлены скрипты:
  - `CHECK_PAYROLL_PAYOUT_BACKFILL_REPORT.sql` (dry-run)
  - `APPLY_PAYROLL_PAYOUT_BACKFILL.sql` (apply)
  - `supabase/migrations/20260324000000_add_expense_category_id_to_staff_payouts.sql`
- Совместимость SQL поправлена:
  - убран `MIN(uuid)` -> заменен на `ARRAY_AGG(...)[1]`
  - тип `'salary'` приведен к enum `transaction_type`

## Остаточные риски (после шага 12)

- Неоднозначные кейсы backfill намеренно не автоправятся (остаются в техотчете на ручную проверку).
- Runtime-проверка в UI зависит от ручного smoke-test (в этом шаге выполнена статическая/кодовая стабилизация).

## Рекомендуемый smoke-test (ручной)

1. Создать выплату из фин. истории и убедиться, что она видна в:
   - фин. истории
   - журнале затрат `Зарплата`
2. Отредактировать сумму/дату/счет/подкатегорию/сотрудника и проверить сквозное обновление.
3. Удалить выплату с причиной и проверить, что запись скрыта в обычных экранах.
4. Проверить отсутствие дублей в журнале затрат `Зарплата`.
