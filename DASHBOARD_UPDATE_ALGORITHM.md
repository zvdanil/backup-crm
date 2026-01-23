# Алгоритм установки значений из журнала посещений v1 в дашборд

## Обзор

Журнал посещений v1 (`GardenAttendanceJournal.tsx`) использует специальную логику для расчета начислений и обновления дашборда. Данный документ описывает полный алгоритм работы.

## Последовательность операций при изменении статуса посещаемости

### 1. Вызов `handleStatusChange` в `GardenAttendanceJournal.tsx`

Когда пользователь изменяет статус посещаемости в журнале v1:

```typescript
handleStatusChange(enrollmentId, studentId, date, status, value)
```

### 2. Расчет начислений

Используется функция `calculateDailyAccrual()`:
- Рассчитывает сумму начисления для base tariff (базовый тариф)
- Рассчитывает сумму возврата для food tariff (тариф на питание) - только при отсутствии
- Возвращает структуру с `amount`, `value`, `baseTariffs`, `foodTariffs`

### 3. Создание/обновление записи посещаемости

```typescript
await setAttendance.mutateAsync({
  enrollment_id: enrollmentId,
  date,
  status: status || null,
  charged_amount: calculatedAmount,
  value: calculatedValue,
  notes: null,
  manual_value_edit: false,
});
```

**Что происходит в `useSetAttendance`**:
- Выполняется `upsert` в таблицу `attendance` (конфликт по `enrollment_id,date`)
- В `onSuccess`:
  - Инвалидируются запросы: `['attendance']`, `['dashboard']`, `['student_activity_balance']`
  - Вызывается `refetchQueries` для `['dashboard']` с `type: 'all'`

### 4. Создание финансовых транзакций

#### A. Base Tariff транзакции (всегда создаются)

```typescript
await upsertTransaction.mutateAsync({
  type: 'income',
  student_id: studentId,
  activity_id: entry.activityId,
  amount: entry.amount,
  date,
  description: `Нарахування за відвідування (${status})`,
  category: 'Навчання',
});
```

**Что происходит в `useUpsertFinanceTransaction`**:
- Ищется существующая транзакция по `date`, `type`, `student_id`, `activity_id`
- Если найдена - обновляется, если нет - создается новая
- В `onSuccess`:
  - Инвалидируются запросы: `['finance_transactions']`, `['dashboard']`, `['student_activity_balance']`
  - Вызывается `refetchQueries` для `['dashboard']`

#### B. Food Tariff транзакции (только при отсутствии)

```typescript
if (status === 'absent' && foodTariffAmount > 0) {
  await upsertTransaction.mutateAsync({
    type: 'expense',
    student_id: studentId,
    activity_id: entry.activityId,
    amount: entry.amount,
    date,
    description: `Повернення за харчування (відсутність)`,
    category: 'Навчання',
  });
} else if (status === 'present') {
  // Удаляем food транзакцию, если она существует
  await deleteTransaction.mutateAsync(foodTransaction.id);
}
```

### 5. Финальная инвалидация и перезапрос

После завершения всех мутаций:

```typescript
// Небольшая задержка для завершения всех мутаций
await new Promise(resolve => setTimeout(resolve, 100));

// Инвалидация всех связанных запросов
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
  queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
  queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
]);

// Принудительный перезапрос дашборда
await queryClient.refetchQueries({ 
  queryKey: ['dashboard'], 
  exact: false,
  type: 'all', // Все запросы, включая неактивные
});
```

## Как дашборд получает данные

### Хук `useDashboardData(year, month)`

Дашборд использует хук `useDashboardData`, который:

1. **Query Key**: `['dashboard', 'full', year, month]`
2. **Запрашивает данные**:
   - `enrollments` - все записи на активности
   - `attendance` - все записи посещаемости за месяц (без лимита)
   - `staff_journal_entries` - записи журнала персонала
   - `finance_transactions` - финансовые транзакции (типы: income, expense, salary, household)

3. **Настройки запроса**:
   - `refetchOnWindowFocus: true` - обновление при фокусе окна
   - `refetchOnMount: true` - обновление при монтировании
   - `staleTime: 0` - данные считаются устаревшими сразу

### Обработка данных в дашборде

1. **`attendanceMap`** - создается из `data.attendance`:
   - Проверка: `if (!data?.attendance || !Array.isArray(data.attendance))`
   - Маппинг: `enrollment_id -> date -> amount`
   - Используется `value` (если есть) или `charged_amount`

2. **`enrollmentsWithAttendanceCharges`** - набор enrollment_id с начислениями:
   - Проходит по `data?.attendance?.forEach()`
   - Добавляет enrollment_id, если `amount !== 0`

3. **`enrollmentsWithTransactions`** - набор student_id:activity_id с транзакциями:
   - Проходит по `data?.financeTransactions?.forEach()`
   - Добавляет ключ, если `amount !== 0`

## Потенциальные проблемы и их решения

### Проблема 1: Ошибка "Cannot read properties of undefined (reading 'length')"

**Причина**: `data.attendance` может быть `undefined` или не массивом.

**Решение**: Добавлена проверка `Array.isArray(data.attendance)` перед использованием методов массивов.

**Места исправления**:
- `src/pages/EnhancedDashboard.tsx` - `attendanceMap` useMemo
- `src/pages/GardenAttendanceJournal.tsx` - все места использования `attendanceData`
- `src/components/attendance/EnhancedAttendanceGrid.tsx` - `attendanceMap` и `enrollmentsWithCharges`
- `src/components/attendance/AttendanceGrid.tsx` - аналогично
- `src/pages/StaffExpenseJournal.tsx` - `attendanceMap`
- `src/hooks/useAttendance.ts` - возврат `data || []`

### Проблема 2: Данные не попадают в дашборд

**Причина**: Возможна гонка условий - `refetchQueries` вызывается до завершения всех мутаций.

**Решение**:
1. Добавлена задержка 100ms перед инвалидацией (в `GardenAttendanceJournal.handleStatusChange`)
2. Добавлено логирование для отладки
3. Использован `type: 'all'` в `refetchQueries` для перезапроса всех запросов, включая неактивные
4. Инвалидация выполняется после всех мутаций, а не в `onSuccess` каждого хука

### Проблема 3: Дублирование инвалидации

**Текущая ситуация**: Инвалидация происходит в трех местах:
1. `useSetAttendance.onSuccess`
2. `useUpsertFinanceTransaction.onSuccess`
3. `GardenAttendanceJournal.handleStatusChange` (после всех мутаций)

**Решение**: Оставлена финальная инвалидация в `handleStatusChange`, так как она гарантирует обновление после всех операций.

## Рекомендации

1. **Мониторинг**: Проверяйте логи консоли для отслеживания процесса обновления
2. **Тестирование**: После изменений проверяйте:
   - Появление записи в дашборде сразу после изменения статуса
   - Отсутствие ошибок в консоли
   - Корректность отображения данных
3. **Производительность**: Задержка 100ms может быть увеличена, если данные не успевают обновиться

## Логирование

Для отладки добавлены логи:
- `[Garden Attendance] Invalidating queries after status change...`
- `[Garden Attendance] Refetching dashboard queries...`
- `[Garden Attendance] Dashboard refetch result`
- `[Dashboard Debug] attendanceMap useMemo recalculating`
- `[Dashboard Debug] useSetAttendance.mutationFn called`
- `[Dashboard Debug] useSetAttendance.onSuccess called`
