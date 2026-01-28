# Инструкция по применению исправления функции distribute_advance_payment

## Проблема
При втором платеже долг не списывается с наибольшего. Функция неправильно определяет, какая активность имеет наибольший долг.

## Причина
1. Использовался `GREATEST` между `income` транзакциями и `attendance.charged_amount`, что неправильно
2. Логика должна быть: если есть `income` транзакции - используем их, иначе используем `attendance.charged_amount`

## Решение
Исправлена логика расчета `charges`:
- Если есть `income` транзакции для активности - используем их сумму
- Если нет `income` транзакций - используем сумму из `attendance.charged_amount`
- Никогда не используем `GREATEST` между ними

## Как применить

### Вариант 1: Через миграцию (рекомендуется)
1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое файла `supabase/migrations/20260229000000_fix_distribute_advance_payment_logic.sql`
3. Выполните SQL запрос

### Вариант 2: Через файл FIX_DISTRIBUTE_FUNCTION_V2.sql
1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое файла `FIX_DISTRIBUTE_FUNCTION_V2.sql`
3. Выполните SQL запрос

## Что изменилось

1. **Добавлен CTE `has_income`**: Определяет, есть ли `income` транзакции для каждой активности
2. **Правильная логика расчета `charges`**: 
   ```sql
   CASE 
     WHEN COALESCE(hi.has_income_transactions, false) THEN
       COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0)
     ELSE
       COALESCE(SUM(a.charged_amount), 0)
   END AS charges
   ```
3. **При каждом платеже долги пересчитываются заново**: Учитываются все предыдущие `advance_payment` транзакции
4. **Сортировка по долгу от большего к меньшему**: `ORDER BY (eb.charges - eb.payments - eb.refunds) DESC`
5. **Последовательное погашение долгов**: Сначала полностью гасится наибольший долг, затем переходим к следующему

## Проверка

После применения исправления:
1. Сделайте тестовый платеж
2. Проверьте, что долги гасятся от наибольшего к наименьшему
3. При втором платеже проверьте, что система правильно определяет наибольший долг

## Важно

Если у вас уже были платежи с неправильным распределением, используйте функцию `rebuild_advance_distribution` для пересчета:
```sql
SELECT * FROM public.rebuild_advance_distribution(
  'student_id'::UUID,
  'account_id'::UUID
);
```
