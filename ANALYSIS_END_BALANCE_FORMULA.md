# Підхід до виправлення «Поточний баланс»

## Проблема (приклад Iris)

- **Переплата на початок:** +1680 ₴
- **До сплати на початок:** 25 560 ₴ (27240 − 1680)
- **Оплачено:** 25 560 ₴
- **Всього нараховано:** 26 820 ₴ (27240 − 420)
- **Поточний баланс (зараз):** 1260 ₴ (неправильно)
- **Поточний баланс (має бути):** −420 ₴ = переплата 420 ₴

## Причина

API рахує `balance = payments − charges + refunds` (місячна дельта) і не враховує початковий баланс. Кінцевий баланс має бути:

```
endBalance = startOfMonthBalance + monthlyDelta
```

де `monthlyDelta = balance` з API.

Зараз: `endBalance = API.balance + excessCredit`, але `excessCredit` рахується тільки для opening і не покриває випадок, коли `basePreviousBalance ≠ 0` (переплата з попередніх місяців).

## Правильна формула

**endBalance = effectiveStartBalance + accountBalance.balance**

де `effectiveStartBalance` — баланс на початок місяця з урахуванням opening:

1. **basePreviousBalance = 0** і **openingForAccount > subscriptionCharges** (надлишок кредиту):
   - `effectiveStartBalance = openingForAccount − subscriptionCharges`
   - Приклад: opening 5000, subscription 2400 → 2600

2. **Інакше:**
   - `effectiveStartBalance = displayPreviousBalance`

## Порядок полів

Поточна послідовність:
1. Нараховано на початок місяця
2. Борг / Переплата на початок
3. До сплати на початок [місяць]
4. Оплачено за місяць
5. — роздільник —
6. Поточний баланс

Логіка читається послідовно: початковий стан → що сплатили → кінцевий баланс. Порядок можна залишити без змін.
