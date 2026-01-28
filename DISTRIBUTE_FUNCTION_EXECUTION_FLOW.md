# Порядок выполнения функции distribute_advance_payment

## Входные параметры
- `p_student_id` - ID студента
- `p_account_id` - ID счёта для распределения
- `p_amount` - Сумма платежа
- `p_payment_date` - Дата платежа (по умолчанию CURRENT_DATE)

## Шаг 1: Валидация и подготовка
1. Проверка: `p_student_id IS NOT NULL`
2. Проверка: `p_account_id IS NOT NULL`
3. Проверка: `p_amount > 0`
4. Определение границ месяца:
   - `v_month_start = DATE_TRUNC('month', p_payment_date)`
   - `v_month_end = последний день месяца`

## Шаг 2: Обновление авансового баланса
1. INSERT или UPDATE в `advance_balances`:
   - Если запись существует: `balance = balance + p_amount`
   - Если нет: `balance = p_amount`
2. Получение текущего баланса: `v_advance_balance`
3. Если `v_advance_balance <= 0` → выход (RETURN 0, 0, 0)
4. `v_remaining_advance = v_advance_balance`

## Шаг 3: Построение списка долгов за месяц

### 3.1. CTE `enrollment_accounts`
- Находит все активные enrollments для студента и счёта
- Определяет `account_id` для каждого enrollment:
  - `COALESCE(enrollment.account_id, activity.account_id)`
- Включает только те, где `account_id = p_account_id`

### 3.2. CTE `has_income_monthly`
- Для каждой активности проверяет, есть ли `income` транзакции за месяц
- Условие: `ft.type = 'income' AND ft.date BETWEEN v_month_start AND v_month_end`
- Результат: `has_income` (true/false)

### 3.3. CTE `monthly_charges`
- **Если `has_income = true`:**
  - `charges = SUM(income транзакций за месяц)`
- **Если `has_income = false`:**
  - `charges = SUM(attendance.charged_amount за месяц)`
- **ВАЖНО:** Если нет ни income, ни attendance → `charges = 0`

### 3.4. CTE `monthly_payments`
- `payments = SUM(payment + advance_payment транзакций за месяц)`
- `refunds = SUM(expense транзакций за месяц)`
- Фильтр по дате: `ft.date BETWEEN v_month_start AND v_month_end`
- Фильтр по account_id: `ft.account_id IS NOT DISTINCT FROM enrollment.account_id`

### 3.5. CTE `monthly_debts`
- Объединяет `monthly_charges` и `monthly_payments`
- **Формула долга:**
  ```
  debt_amount = charges - payments - refunds
  ```
- **Условия фильтрации:**
  - `charges > 0` (только активности с начислениями)
  - `(charges - payments - refunds) > 0` (только те, у кого есть долг)

### 3.6. Финальный SELECT
- Сортировка:
  1. По `charges DESC` (наибольшее начисление первым)
  2. По `debt_amount DESC` (внутри одинаковых начислений - наибольший долг)

## Шаг 4: Цикл распределения платежа

Для каждой записи из `monthly_debts` (в порядке сортировки):

1. **Проверка:** `IF v_remaining_advance <= 0 THEN EXIT`
2. **Проверка:** `IF debt_amount <= 0 THEN CONTINUE`
3. **Расчёт суммы погашения:**
   ```
   v_payment_amount = LEAST(debt_amount, v_remaining_advance)
   ```
   - Гасим либо весь долг, либо остаток аванса (что меньше)
4. **Создание транзакции `advance_payment`:**
   - `type = 'advance_payment'`
   - `student_id = p_student_id`
   - `activity_id = debt_record.activity_id`
   - `account_id = p_account_id`
   - `amount = v_payment_amount`
   - `date = p_payment_date`
   - `description = 'Автоматичне погашення з авансового рахунку'`
5. **Обновление счётчиков:**
   - `v_payments_count = v_payments_count + 1`
   - `v_distributed = v_distributed + v_payment_amount`
   - `v_remaining_advance = v_remaining_advance - v_payment_amount`

## Шаг 5: Финальное обновление авансового баланса
- UPDATE `advance_balances`:
  - `balance = v_remaining_advance`
  - `updated_at = now()`

## Шаг 6: Возврат результата
- `distributed_amount = v_distributed`
- `remaining_advance = v_remaining_advance`
- `payments_created = v_payments_count`

---

## Потенциальная проблема с возвратами (refunds)

### Сценарий проблемы:
Для активности с питанием:
- `charges = 0` (нет начислений, только возвраты)
- `payments = 0` (нет оплат)
- `refunds = 3780` (возврат за перерасчёт)

### Что происходит в функции:

1. **В `monthly_charges`:**
   - `has_income = false` (нет income транзакций)
   - `charges = SUM(attendance.charged_amount)` = 0 (если нет посещений)
   - **Результат:** `charges = 0`

2. **В `monthly_payments`:**
   - `payments = 0`
   - `refunds = 3780`

3. **В `monthly_debts`:**
   - `debt_amount = 0 - 0 - 3780 = -3780`
   - **Условие фильтрации:** `charges > 0` → **НЕ ПРОХОДИТ!**
   - **Результат:** Активность **НЕ попадает** в список долгов ✅

### Но если есть начисления:

Для активности с питанием:
- `charges = 1000` (есть начисления)
- `payments = 0`
- `refunds = 3780` (возврат больше начислений)

1. **В `monthly_debts`:**
   - `debt_amount = 1000 - 0 - 3780 = -2780`
   - **Условие:** `(charges - payments - refunds) > 0` → **НЕ ПРОХОДИТ!**
   - **Результат:** Активность **НЕ попадает** в список долгов ✅

### Проблемный случай:

Для активности с питанием:
- `charges = 5000` (есть начисления)
- `payments = 2000` (есть оплаты)
- `refunds = 3780` (возврат)

1. **В `monthly_debts`:**
   - `debt_amount = 5000 - 2000 - 3780 = -780`
   - **Условие:** `(charges - payments - refunds) > 0` → **НЕ ПРОХОДИТ!**
   - **Результат:** Активность **НЕ попадает** в список долгов ✅

### ВОЗМОЖНАЯ ПРОБЛЕМА:

Если у активности:
- `charges = 5000`
- `payments = 1000`
- `refunds = 3780`
- `debt_amount = 5000 - 1000 - 3780 = 220` (есть долг!)

Но пользователь видит в UI:
- `balance = payments - charges + refunds = 1000 - 5000 + 3780 = -220` (долг 220)

И это правильно! Функция должна погасить долг 220.

**НО!** Если пользователь говорит, что "не произошло полного списания долга", возможно:

1. **Проблема в формуле:** Возможно, для активностей с питанием формула должна быть другой?
2. **Проблема в фильтрации:** Возможно, условие `charges > 0` отсекает активности, где charges = 0, но есть долг из-за других причин?
3. **Проблема в расчёте:** Возможно, refunds учитываются неправильно в формуле долга?

## Вопросы для диагностики:

1. **Какая активность?** (питание или другая?)
2. **Какие значения?** (charges, payments, refunds за месяц)
3. **Что показывает UI?** (какой баланс видит пользователь)
4. **Что показывает функция?** (какой долг она видит)
