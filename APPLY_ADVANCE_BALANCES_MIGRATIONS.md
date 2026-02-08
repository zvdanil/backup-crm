# Применение миграций для системы авансовых балансов

## Проблема

Функция удаления платежей не работает из-за отсутствия таблицы `advance_balances` и связанных функций.

## Необходимые миграции (в порядке применения)

### 1. Создание таблицы advance_balances

**Файл:** `supabase/migrations/20260215000000_add_advance_balances.sql`

- Создаёт таблицу `advance_balances`
- Добавляет тип транзакции `advance_payment`

### 2. Функция распределения авансовых платежей

**Файл:** `supabase/migrations/20260215000001_add_distribute_advance_payment_function.sql`

- Создаёт функцию `distribute_advance_payment()`
- Распределяет платежи по начислениям

### 3. Триггер автоматического распределения

**Файл:** `supabase/migrations/20260215000002_add_auto_distribute_trigger.sql`

- Создаёт триггер автоматического вызова распределения при создании платежа

### 4. Функция автосписания с аванса

**Файл:** `supabase/migrations/20260215000003_add_auto_charge_from_advance_function.sql`

- Создаёт функцию `auto_charge_from_advance()`
- Автоматически списывает с аванса при создании начисления

### 5. Функция удаления платежа

**Файл:** `supabase/migrations/20260227000000_add_delete_payment_function.sql`

- Создаёт функцию `delete_payment_transaction()`
- Откатывает распределение при удалении платежа

### 6. Функция пересчета распределения

**Файл:** `supabase/migrations/20260228000000_add_rebuild_advance_distribution_function.sql`

- Создаёт функцию `rebuild_advance_distribution()`
- Пересчитывает распределение для студента и счёта

### 7. Исправление логики распределения

**Файл:** `supabase/migrations/20260229000000_fix_distribute_advance_payment_logic.sql`

- Исправляет логику функции `distribute_advance_payment()`

### 8. Упрощённая функция автосписания

**Файл:** `supabase/migrations/20260230000000_add_auto_charge_from_advance_simplified.sql`

- Создаёт упрощённую функцию `auto_charge_from_advance_simplified()`

## Порядок применения

Открыть Supabase Dashboard → SQL Editor и применить каждую миграцию по очереди:

```bash
1. 20260215000000_add_advance_balances.sql
2. 20260215000001_add_distribute_advance_payment_function.sql
3. 20260215000002_add_auto_distribute_trigger.sql
4. 20260215000003_add_auto_charge_from_advance_function.sql
5. 20260227000000_add_delete_payment_function.sql
6. 20260228000000_add_rebuild_advance_distribution_function.sql
7. 20260229000000_fix_distribute_advance_payment_logic.sql
8. 20260230000000_add_auto_charge_from_advance_simplified.sql
```

## Минимально необходимые для удаления платежей

Для работы функции удаления платежей достаточно применить первые 5 миграций:

1. `20260215000000_add_advance_balances.sql` - таблица
2. `20260215000001_add_distribute_advance_payment_function.sql` - функция распределения (используется в других местах)
3. `20260215000002_add_auto_distribute_trigger.sql` - триггер (автоматизация)
4. `20260215000003_add_auto_charge_from_advance_function.sql` - автосписание (автоматизация)
5. `20260227000000_add_delete_payment_function.sql` - функция удаления (основная)

Остальные миграции можно применить позже для полной функциональности системы авансовых балансов.
