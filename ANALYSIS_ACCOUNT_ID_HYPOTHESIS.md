# Аналіз гіпотези: різниця прив'язки рахунку між UI та API

## Висновок
**Гіпотезу частково підтверджено.** API коректно отримує й використовує `enrollment.account_id`, але виявлено **проблему з інвалідацією кешу**, через яку після зміни рахунку в око редагування можуть показуватися застарілі дані.

---

## 1. Джерела прив'язки рахунку

- **Налаштування активності** — `activity.account_id`
- **Окно редагування enrollment** — `enrollment.account_id` (індивідуально для дитини)

Пріоритет узгоджений і в UI, і в API:
```
enrollment.account_id ?? activity.account_id
```

---

## 2. API (useFinanceTransactions)

### 2.1 Отримання даних

```1329:1333:src/hooks/useFinanceTransactions.ts
  const { data: enrollments, error: enrollmentsError } = await supabaseAny
    .from("enrollments")
    .select(
      "id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at, effective_from",
    )
```

`account_id` входить у select — API отримує `enrollment.account_id`.

### 2.2 Обробка в computeStudentAccountBalancesFromData

```1193:1204:src/hooks/useFinanceTransactions.ts
  allFilteredEnrollments.forEach((enrollment: any) => {
    enrollmentActivityMap.set(enrollment.id, enrollment.activity_id);
    enrollmentAccountMap.set(enrollment.id, enrollment.account_id ?? null);
    enrollmentDataMap.set(enrollment.id, {
      ...
      account_id: enrollment.account_id ?? null,
      ...
    });
  });
```

### 2.3 Розподіл charges по рахунках

```1685:1688:src/hooks/useFinanceTransactions.ts
      enrollmentsForActivity.forEach(([enrollmentId, enrollmentData]) => {
        const accountId =
          enrollmentData.account_id ??
          activityAccountMap[enrollmentData.activity_id] ??
          null;
```

Пріоритет коректний: спочатку `enrollment.account_id`, потім `activity.account_id`.

---

## 3. UI (StudentAccountBalance)

### 3.1 Групування enrollment

```188:191:src/components/students/StudentAccountBalance.tsx
    balanceEnrollments.forEach((enrollment) => {
      // Приоритет: enrollment.account_id ?? activity.account_id
      const accountId =
        enrollment.account_id || enrollment.activities.account_id || "none";
```

`balanceEnrollments` беруться з `useEnrollments` (з join `activities`).

### 3.2 Джерело даних

`useEnrollments`:
- `select("*, students(...), activities (*)")` → `account_id` є в обʼєкті enrollment.
- Після збереження змін інвалідується лише `['enrollments']`.

---

## 4. Виявлена проблема: інвалідація кешу

### 4.1 useUpdateEnrollment (onSuccess)

```234:237:src/hooks/useEnrollments.ts
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment_price_history'] });
      toast({ title: 'Запись обновлена' });
```

Після зміни `account_id` через EditEnrollmentForm **НЕ** інвалідується `['student_account_balances']`.

### 4.2 Наслідок

1. Користувач змінює рахунок в око редагування → оновлюється `enrollment.account_id`.
2. `enrollments` перезапитується → групування в UI вже за новим рахунком.
3. `student_account_balances` залишається в кеші → `accountBalances` обчислені за старим `account_id`.
4. Блок "ФОП" може бути побудований з актуальних enrollments, але з даними з кешу, де 10000 ще прив’язані до "Без рахунку".

### 4.3 Збереження в БД

EditEnrollmentForm і handleUpdateEnrollment передають `account_id` у `updateEnrollment`:

```213:219:src/pages/StudentDetail.tsx
      await updateEnrollment.mutateAsync({
        id: editingEnrollment.id,
        ...
        account_id: newAccountId,
      });
```

`useUpdateEnrollment` оновлює enrollment через `.update(enrollment)`, тож `account_id` коректно потрапляє в БД.

---

## 5. Можливі сценарії проблеми

| Сценарій | enrollment.account_id | activity.account_id | Результат API | Результат UI |
|----------|------------------------|---------------------|---------------|--------------|
| A        | null                   | null                | 10000 → "none" | Річні внески в "Без рахунку" |
| B        | ФОП                    | null                | 10000 → ФОП   | Річні внески в ФОП |
| C        | null                   | ФОП                 | 10000 → ФОП   | Річні внески в ФОП |

Якщо на скріні обидві секції під «ФОП Зверєва» — має бути A або B із прив’язкою до ФОП. Якщо при цьому Поточний баланс = 7800 — найімовірніше:

- `accountBalances` з кешу (10000 ще прив’язані до "none"), або
- `chargesFromRows` не включає 10000 через проблему з `reportCharge` / timing.

---

## 6. Рекомендації

### 6.1 Обов’язково

1. **Інвалідувати `student_account_balances` після зміни enrollment**
   - У `useUpdateEnrollment`, `onSuccess` додати:
   ```ts
   queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
   ```

### 6.2 Бажано

2. **Перевірити чи викликається інвалідація після оновлення finance_transactions**
   - У `handleUpdateEnrollment` після оновлення `account_id` у транзакціях варто інвалідувати `student_account_balances` (або переконатися, що це робиться в мутації).

3. **Додати логування для діагностики**
   - Для enrollment "Річні внески": `enrollment.account_id`, `enrollment.activities?.account_id`.
   - При розподілі в API: `enrollmentData.account_id`, `activityAccountMap[activity_id]`.

---

## 7. Висновок по гіпотезі

- **API**: `enrollment.account_id` береться з Supabase і коректно передається в `computeStudentAccountBalancesFromData`; пріоритет узгоджений з UI.
- **UI**: використовує `enrollment.account_id || enrollment.activities.account_id`; пріоритет узгоджений з API.
- **Проблема**: при зміні `account_id` через EditEnrollmentForm не інвалідується кеш `student_account_balances`, через що на екрані можуть залишатися обчислення за старим рахунком.

**Рекомендований крок**: додати інвалідацію `student_account_balances` у `onSuccess` хука `useUpdateEnrollment`.
