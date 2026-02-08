# Применение миграции для удаления платежей

## Ошибка
```
Failed to load resource: the server responded with a status of 400/404
[useDeletePaymentTransaction] RPC error
```

## Причина
Функция `delete_payment_transaction` либо не существует (404), либо не может выполниться (400) из-за отсутствия таблицы `advance_balances`

## Решение (ПРОСТОЕ) ✅

Применить УПРОЩЁННУЮ миграцию, которая НЕ требует advance_balances:

**Файл:** `supabase/migrations/20260308000000_add_simple_delete_payment_function.sql`

### Шаги

1. Открыть Supabase Dashboard: https://supabase.com/dashboard
2. Выбрать проект
3. Перейти в SQL Editor
4. Скопировать содержимое файла `supabase/migrations/20260308000000_add_simple_delete_payment_function.sql`
5. Вставить в SQL Editor
6. Нажать RUN

### Что делает миграция

Создаёт упрощённую функцию `delete_payment_transaction`:
- Удаляет платёж по ID
- НЕ требует таблицу advance_balances
- НЕ требует другие функции и триггеры
- Возвращает результаты в JSON формате

---

## Альтернативное решение (ПОЛНОЕ)

Если нужна полная система авансовых балансов с автоматическим распределением, см. файл:
**`APPLY_ADVANCE_BALANCES_MIGRATIONS.md`**

Там описано применение 8 миграций для полной функциональности.

---

## После применения

Функция удаления платежей в карточке ребёнка будет работать корректно.
