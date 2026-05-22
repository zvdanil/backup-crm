# Перенарахувати за місяць — алгоритм і логіка

## Де знаходиться код

| Роль | Файл | Функція / Місце |
|------|------|-----------------|
| Мутація перерахунку | `src/hooks/useFinanceTransactions.ts` | `useRecalculateMonthlyCharges` (~3033) |
| Відображення кнопки | `src/components/students/StudentAccountBalance.tsx` | кнопка «Перенарахувати» |
| Розрахунок суми одного відвідування | `src/hooks/useEnrollments.ts` | `calculateAttendanceChargeForRecalc` (~917) |
| Розрахунок суми за правилами білінгу | `src/lib/attendance.ts` | `calculateValueFromBillingRules` (~355) |
| Тариф активності на конкретну дату | `src/hooks/useActivities.ts` | `getBillingRulesForDate` (~371) |
| Ціна запису на конкретну дату | `src/hooks/useEnrollments.ts` | `getEnrollmentPriceForDate` |

---

## Ключові таблиці БД

| Таблиця | Роль |
|---------|------|
| `enrollments` | Записи дитини на активності |
| `activities` | Активності (тип, тариф, payment_type, billing_rules) |
| `attendance` | Відмітки відвідування (status, charged_amount, value, manual_value_edit) |
| `finance_transactions` | Транзакції (type = income/payment/expense) |
| `subscription_charge_exclusions` | Виключення «Нараховано на початок місяця» для конкретного enrollment/місяця |
| `activity_price_history` | Історія тарифів активності (billing_rules + effective_from/to) |
| `enrollment_price_history` | Індивідуальна ціна запису в часі |
| `enrollment_account_history` | Рахунок запису в часі |

---

## Типи активностей та спосіб їх обробки

### 1. Garden controller + base tariff — **пропускаємо повністю**

Визначення: `isGardenAttendanceController(activity) === true` (є `config.base_tariff_ids`).

До `gardenSkipIds` потрапляють:
- ID контролер-активності
- Усі `base_tariff_ids` з конфігу контролера

Ці активності **пропускаються повністю** (`continue`): їхні income-транзакції керуються
безпосередньо в `GardenAttendanceJournal` при кожній відмітці.

### 2. Garden food tariff — **чистимо зайві income tx, потім пропускаємо**

До `gardenFoodIds` потрапляють: усі `food_tariff_ids` з конфігу контролера.

Логіка:
1. **Видалити** всі income-транзакції food-активності за місяць (cleanup spurious txs).
2. **Не створювати** нових транзакцій (`continue`).

Food-активності отримують лише **expense**-транзакції (повернення за харчування при
відсутності) — їх створює `GardenAttendanceJournal`. Income-транзакцій у food-активностей
бути не повинно.

> **Чому потрібне видалення?** Якщо попередній запуск «Перенарахувати» (до виправлення)
> не мав garden-skip, він міг створити зайву income-транзакцію для food-активності
> (через `payment_type = 'subscription'`). Ця транзакція зменшувала баланс: наприклад,
> при 5 пропусках × 420 відображалося +1680 (2100 − 420) замість +2100.
> Cleanup видаляє таку транзакцію при першому ж запуску «Перенарахувати».

### 3. Subscription (`payment_type === 'subscription'`) — **одна income tx на місяць**

Приклади: «Дитсадок повний день», «Щомісячна абонплата».

Алгоритм:
1. Видалити всі income tx цієї активності за місяць.
2. Якщо enrollment відписаний до початку місяця → додати exclusion, tx не створювати.
3. Розрахувати суму (пріоритет: custom_price запису → billing_rules.present.rate → default_price).
4. Видалити exclusion (активний запис → нараховуємо).
5. Якщо сума = 0 → додати exclusion замість tx.
6. Якщо сума > 0 → створити одну income tx з датою = 1-е число місяця.

Дата income tx = `monthStart` (перший день місяця), незалежно від кількості відвідувань.

### 4. Per-session (`payment_type === 'per_session'`) — **income tx на кожне відвідування**

Приклади: «Хореографія», «Футбол», будь-яка активність з погодинною або поштучною оплатою.

Алгоритм:
1. Видалити всі income tx цієї активності за місяць.
2. Видалити stale exclusion (per-session активності ніколи не виключаються через exclusion).
3. Якщо enrollment відписаний до початку місяця → пропустити (changedCount++), continue.
4. Завантажити записи attendance за місяць, відсортовані за датою (ASC).
5. Для кожного запису attendance — розрахувати суму та відтворити income tx (деталі нижче).

---

## Алгоритм обробки одного attendance-запису (per-session)

```
для кожного record у attendanceRows (відсортовано за датою):

  1. Відстежити visitCountBefore для subscription_with_logic —
     ПЕРЕД будь-якими пропусками (щоб manual-запис теж рахувався як візит
     для наступних записів із тим самим статусом).

  2. Визначити суму та значення:
     a) manual_value_edit = true  →  зберегти charged_amount/value без змін
     b) status = null              →  числова відмітка, value = поточне record.value
     c) інакше                     →  calculateAttendanceChargeForRecalc(...)

  3. Оновити attendance (тільки для не-manual записів, і тільки якщо значення змінилося):
     SET charged_amount = chargedAmount, value = newValue, manual_value_edit = false

  4. Якщо chargedAmount > 0 → INSERT income tx:
       date = record.date, amount = chargedAmount, attendance_id = record.id
```

### manual_value_edit = true

Прапор означає, що користувач вручну відредагував суму в журналі. Правило: **не перераховуємо**.
- `charged_amount` і `value` беруться з поточного запису без змін.
- Income tx все одно відтворюється (якщо charged_amount > 0).
- Запис attendance НЕ оновлюється.

### visitCountBefore для subscription_with_logic

Для кастомних статусів типу `subscription_with_logic` (абонемент з логікою) тарифна сітка залежить від порядкового номера візиту в місяці:
- Візит 1: мінімальна сума = `rate * (1 - return_percent / 100)`
- Візит `threshold`: решта суми = `rate - minAmount`
- Інші візити: 0

`visitCountBefore` = скільки записів із цим самим статусом вже було до поточного в місяці.
Відстежується в `Map<status_id, count>` і збільшується **перед** будь-якою перевіркою
`manual_value_edit` — так manual-записи теж враховуються у лічильнику для подальших записів.

---

## Розрахунок суми через calculateAttendanceChargeForRecalc

Функція враховує:
- **Тариф активності на дату** через `getBillingRulesForDate(activity, activityPriceHistory, date)` — якщо є history → повертає billing_rules відповідного запису; інакше `activity.billing_rules`.
- **Індивідуальну ціну запису на дату** через `getEnrollmentPriceForDate(enrollment, enrollmentPriceHistory, date)`.
- Пріоритет: `custom_price запису > billing_rules (базові статуси + кастомні статуси)`.

### Типи правил білінгу в billing_rules.present / custom_statuses

| type | Опис | Формула |
|------|------|---------|
| `subscription` | Абонемент (місячна / кількість робочих днів) | `rate / workingDaysInMonth` |
| `fixed` | Фіксована сума за відвідування | `rate` |
| `hourly` | Погодинна оплата | `rate * value` |
| `subscription_with_logic` | Абонемент з логікою (тільки для кастомних статусів) | Залежить від visitCountBefore |

> **Важливо:** тип `fixed` у `billing_rules.present` — це ціна **за одне відвідування**, НЕ місячна плата.
> Місячність визначається полем `activity.payment_type === 'subscription'`, а не типом правила.

---

## Як визначається рахунок (account_id) для income tx

```
enrollment_account_history для enrollment.id на дату monthEnd
  ?? enrollment.account_id
    ?? activity.account_id
      ?? null
```

---

## Як «Харчування» відображається в картці дитини

Для food-активності (`isFoodActivity = true`) рядок у `StudentActivityBalanceRow` показує:

| Елемент UI | Джерело | Що означає |
|------------|---------|------------|
| `+N грн` (основна сума) | `balance = payments − charges + refunds` | Фактично повернуто батькам |
| `Пропусків: K` | count expense-транзакцій за місяць | Кількість днів відсутності |
| `Переплата в поточному місяці: M` | sum expense-транзакцій за місяць | Загальна сума повернень |

**Якщо `+N грн` ≠ `Переплата: M`** — значить у food-активності є зайва **income**-транзакція
(`charges > 0`), яка зменшує баланс: `balance = 0 − charges + refunds`.
Запустіть «Перенарахувати» — функція видалить зайву income tx і баланс вирівняється.

---

## Що відбувається з «Нараховано на початок місяця» (subscriptionOnlyChargesByActivity)

Це значення в `calculateMonthlyBalanceFromData` (`useFinanceTransactions.ts`) береться з фактичних income tx (не з тарифу), якщо вони є. Таким чином після перерахунку UI одразу показує актуальну суму без перезавантаження.

Виключення (exclusion) в `subscription_charge_exclusions` блокує відображення рядка для конкретного enrollment/місяця.

---

## Ключові правила (не порушувати при модифікації)

1. **Garden-активності: три різні категорії з різною логікою**
   - Контролер + base tariff → `gardenSkipIds` → пропустити повністю
   - Food tariff → `gardenFoodIds` → видалити income tx (cleanup) + пропустити створення
   - Решта → обробляти стандартно

2. **isMonthlyBilling визначається через `payment_type`, а не тип правила білінгу**:
   ```ts
   const isMonthlyBilling = activity.payment_type === "subscription";
   ```

3. **visitCountBefore відстежувати до перевірки manual_value_edit** — інакше manual-записи ламають тарифну сітку subscription_with_logic.

4. **manual_value_edit = true** → не перераховувати суму, але income tx відтворити.

5. **Спочатку видалити ВСІ income tx, потім відтворити** — не порівнювати, не патчити. Це запобігає дублюванню при повторних натисканнях.

6. **Exclusion для per-session активностей** — завжди видаляти (вони ніколи не повинні мати exclusion).

7. **Дата parsing** — `YYYY-MM-DD` через `.split('-').map(Number)` + `new Date(y, m-1, d)`, не `new Date(str)` (зсув UTC).

8. **Food-активності не повинні мати income tx** — лише expense tx (повернення за харчування).
   Якщо income tx з'явилася (баг попередньої версії) — вона видаляється при наступному «Перенарахувати».

---

## Потік даних при натисканні «Перенарахувати»

```
StudentAccountBalance.tsx
  → useRecalculateMonthlyCharges().mutate({ studentId, month, year, reason })
    → Завантажити enrollments, priceHistory, accountHistory, activities, activityPriceHistory
    → Побудувати gardenSkipIds (controller + base tariff)
    → Побудувати gardenFoodIds (food tariff)
    → Для кожного enrollment:
        якщо gardenSkipIds    → skip повністю
        якщо gardenFoodIds    → delete income txs (cleanup) → skip
        якщо subscription     → delete income txs → create 1 tx / exclusion
        якщо per_session      → delete income txs → delete exclusion → for each attendance → create tx
    → Повернути changedCount
  → onSuccess → invalidateQueries (finance_transactions, attendance, student_account_balances, ...)
  → React Query перезавантажує дані → UI оновлюється
```

---

## GardenAttendanceJournal — надійність відмітки

Відмітки в журналі v1 ненадійні при швидкому кліканні. Зафіксовані проблеми та виправлення:

### Архітектура запису відмітки

При кліку на клітинку журналу запускається `handleStatusChange` (fire-and-forget):
1. `calculateDailyAccrual()` — синхронний розрахунок денної суми
2. `await setAttendance.mutateAsync()` — upsert запису attendance
3. `await upsertTransaction.mutateAsync()` — income tx для кожної base-tariff активності
4. `await upsertTransaction.mutateAsync()` — expense tx для food-tariff (якщо статус = absent)
5. `scheduleDebouncedSync()` — синхронізація журналу педагога (fire-and-forget, 400ms debounce)

### Виправлені проблеми

**Проблема 1: зайва legacy TX для garden-контролера**
`useSetAttendance.onSuccess` (загальний хук) після будь-якої відмітки створював income-транзакцію
для активності enrollment. Для garden-контролера це зайво — журнал сам керує транзакціями.
При 5 швидких кліках = 5 × (3 SELECT + 1 INSERT) = 15 зайвих DB-операцій конкурентно.

**Виправлення** (`useAttendance.ts`, `useSetAttendance.onSuccess`):
```ts
const isGardenController = !!(activityConfig?.base_tariff_ids?.length);
if (isGardenController) return; // Пропустити legacy TX для garden
```

**Проблема 2: подвійний клік = конкурентна обробка тієї самої клітинки**
`handleCellChange` запускав `handleStatusChange` fire-and-forget без будь-якого lock.
Два кліки на одну клітинку → два конкурентних SELECT+INSERT для однієї дати.

**Виправлення** (`GardenAttendanceJournal.tsx`):
```ts
const processingCells = useRef(new Set<string>()); // key = enrollmentId-date
// При кліку: if (processingCells.current.has(key)) return;
```

**Проблема 3: помилки відмітки ховалися мовчки**
`handleCellChange` не мав `.catch()`. Якщо `handleStatusChange` падав (timeout, DB error) —
attendance записувався (перший await), але TX — ні. Користувач не знав про помилку.

**Виправлення** (`GardenAttendanceJournal.tsx`):
```ts
handleStatusChange(...).catch(error => {
  toast({ title: 'Помилка відмітки', description: 'Спробуйте ще раз.', variant: 'destructive' });
}).finally(() => { ... });
```
