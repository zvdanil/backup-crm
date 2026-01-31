# Финальное видение решения: Начисление ЗП педагогам в журнале посещений v1

## Текущая ситуация

### Что работает ✅
1. **Создание attendance записей** - при отметке посещаемости создается/обновляется запись в `attendance`
2. **Создание finance_transactions (income) для студентов** - для каждой base tariff activity создается транзакция типа `income`
3. **Отображение в дашборде** - данные корректно отображаются

### Что НЕ работает ❌
1. **Создание staff_journal_entries для педагогов** - отсутствует логика
2. **Создание finance_transactions (salary) для педагогов** - отсутствует логика
3. **Отражение в финансовой истории педагога** - нет данных для отображения
4. **Отражение в балансах** - нет данных для расчета

## Пользовательский опыт (требования)

### Контекст
- В журнале посещений v1 отображаются дети, подписанные на **управляющую активность**
- В управляющей активности установлены связи:
  - `config.base_tariff_ids` - массив ID базовых тарифов (например, "Прескул")
  - `config.food_tariff_ids` - массив ID тарифов на харчувание
- Для каждой base tariff activity (например, "Прескул") у педагога создано **индивидуальное правило начисления** (`staff_billing_rules`)

### Ожидаемое поведение
1. Пользователь отмечает посещаемость ребенка в журнале v1
2. Система создает `attendance` запись для управляющей активности
3. Система создает `finance_transactions` типа `income` для каждой base tariff activity
4. **НОВОЕ:** Система должна:
   - Для каждой base tariff activity:
     - Получить все `staff_billing_rules` для этой активности
     - Собрать все `attendance` записи за месяц для этой активности (через enrollments)
     - Рассчитать начисления для педагогов на основе правил
     - Создать/обновить `staff_journal_entries` для каждого педагога
   - `finance_transactions` типа `salary` создаются автоматически (через триггеры или в другом месте)

## Техническое решение

### Архитектура

#### 1. Структура данных
```
Управляющая активность (controller activity)
├── config.base_tariff_ids: ["прескул_id", "другая_активность_id"]
├── config.food_tariff_ids: ["харчування_id"]
└── enrollments: [дети, подписанные на управляющую активность]

Base tariff activity (например, "Прескул")
├── staff_billing_rules: [правила начисления для педагогов]
└── enrollments: [дети, подписанные на эту активность]

Attendance записи
├── enrollment_id → enrollment.activity_id (может быть управляющей или base tariff)
└── Для расчета начислений нужно найти соответствующие base tariff enrollments
```

#### 2. Алгоритм синхронизации

**Шаг 1: Определение base tariff activities**
- Получить `config.base_tariff_ids` из управляющей активности
- Для каждой base tariff activity выполнить шаги 2-5

**Шаг 2: Получение billing rules**
- Использовать `useAllStaffBillingRulesForActivity(baseTariffActivityId)` для получения всех правил
- Создать функцию `getBillingRuleForDate(activityId, date)` аналогично `EnhancedAttendanceGrid`

**Шаг 3: Сбор attendance записей**
- Для каждой base tariff activity найти все enrollments с `activity_id = baseTariffActivityId`
- Собрать все `attendance` записи за месяц для этих enrollments
- Преобразовать в формат `AttendanceRecord[]` для `calculateMonthlyStaffAccruals()`

**Шаг 4: Расчет начислений**
- Использовать `calculateMonthlyStaffAccruals()` из `src/lib/salaryCalculator.ts`
- Получить `Map<staffId, Map<date, DailyAccrual>>`

**Шаг 5: Создание/обновление staff_journal_entries**
- Для каждого педагога и каждой даты:
  - Если есть начисление (`amount > 0`): создать/обновить `staff_journal_entry`
  - Если нет начисления: удалить существующую запись (если есть)
- Использовать `useUpsertStaffJournalEntry()` и `useDeleteStaffJournalEntry()`

#### 3. Точка вызова

**Вариант A: После каждого изменения attendance (рекомендуется)**
- Вызывать синхронизацию в `handleStatusChange()` после создания/обновления `attendance`
- Синхронизировать весь месяц (как в `EnhancedAttendanceGrid`)

**Вариант B: Периодическая синхронизация**
- Вызывать синхронизацию при загрузке компонента
- Вызывать при изменении месяца/года

**Рекомендация: Вариант A** - аналогично `EnhancedAttendanceGrid.tsx` (строка 939)

### Реализация

#### Функция синхронизации

```typescript
const syncStaffJournalEntriesForBaseTariffs = useCallback(async () => {
  if (!controllerActivity || !controllerActivityId) return;
  
  const config = (controllerActivity.config as GardenAttendanceConfig) || {};
  const baseTariffIds = config.base_tariff_ids || [];
  
  if (baseTariffIds.length === 0) return;
  
  // Для каждой base tariff activity
  for (const baseTariffActivityId of baseTariffIds) {
    // 1. Получить billing rules для этой активности
    const { data: billingRules = [] } = await queryClient.fetchQuery({
      queryKey: ['staff-billing-rules-activity', baseTariffActivityId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('staff_billing_rules')
          .select('*')
          .or(`activity_id.eq.${baseTariffActivityId},activity_id.is.null`)
          .order('effective_from', { ascending: false });
        if (error) throw error;
        return data;
      }
    });
    
    // 2. Создать функцию getBillingRuleForDate
    const getBillingRuleForDate = (date: string) => {
      // Логика выбора правила для даты (аналогично EnhancedAttendanceGrid)
    };
    
    // 3. Собрать attendance записи за месяц для этой активности
    const baseTariffEnrollments = allEnrollments.filter(
      e => e.activity_id === baseTariffActivityId && e.is_active
    );
    
    const attendanceRecords: AttendanceRecord[] = [];
    // Преобразовать attendance записи в формат AttendanceRecord
    
    // 4. Рассчитать начисления
    const accruals = calculateMonthlyStaffAccruals({
      attendanceRecords,
      getRuleForDate: getBillingRuleForDate,
    });
    
    // 5. Создать/обновить staff_journal_entries
    const dateStrings = days.map(day => formatDateString(day));
    const promises: Promise<any>[] = [];
    
    accruals.forEach((staffAccruals, staffId) => {
      dateStrings.forEach((date) => {
        const dayAccrual = staffAccruals.get(date);
        if (dayAccrual && dayAccrual.amount > 0) {
          // Создать/обновить запись
          promises.push(
            upsertStaffJournalEntry.mutateAsync({
              staff_id: staffId,
              activity_id: baseTariffActivityId,
              date,
              amount: finalAmount,
              base_amount: dayAccrual.amount,
              deductions_applied: deductionsApplied,
              is_manual_override: false,
              notes: dayAccrual.notes.join('; ') || null,
            })
          );
        } else {
          // Удалить запись, если нет начисления
          promises.push(
            deleteStaffJournalEntry.mutateAsync({
              staff_id: staffId,
              activity_id: baseTariffActivityId,
              date,
              is_manual_override: false,
            })
          );
        }
      });
    });
    
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }
}, [controllerActivity, controllerActivityId, allEnrollments, days, ...]);
```

#### Вызов в handleStatusChange

```typescript
// После создания/обновления attendance
await setAttendance.mutateAsync({...});

// После создания finance_transactions для студентов
// ...

// Синхронизировать staff_journal_entries для всех base tariff activities
await syncStaffJournalEntriesForBaseTariffs();
```

### Импорты и зависимости

```typescript
import { useAllStaffBillingRulesForActivity, useUpsertStaffJournalEntry, useDeleteStaffJournalEntry, getStaffBillingRuleForDate } from '@/hooks/useStaffBilling';
import { calculateMonthlyStaffAccruals, type AttendanceRecord } from '@/lib/salaryCalculator';
import { applyDeductionsToAmount } from '@/lib/staffSalary';
import { useStaff } from '@/hooks/useStaff';
```

### Важные моменты

1. **Множественные base tariff activities** - синхронизация должна выполняться для каждой отдельно
2. **Связь attendance с base tariff** - attendance создается для управляющей активности, но начисления считаются для base tariff activities
3. **Поиск enrollments** - нужно найти enrollments с `activity_id = baseTariffActivityId`, а не с управляющей активностью
4. **Фильтрация attendance** - нужно фильтровать attendance записи по enrollments для base tariff activities
5. **Обработка удаления** - при удалении attendance нужно также удалить соответствующие staff_journal_entries

## План реализации

1. ✅ Добавить импорты необходимых функций и хуков
2. ✅ Создать функцию `syncStaffJournalEntriesForBaseTariffs()`
3. ✅ Реализовать логику получения billing rules для каждой base tariff activity
4. ✅ Реализовать сбор attendance записей для каждой base tariff activity
5. ✅ Реализовать расчет начислений через `calculateMonthlyStaffAccruals()`
6. ✅ Реализовать создание/обновление/удаление `staff_journal_entries`
7. ✅ Вызвать синхронизацию в `handleStatusChange()` после создания/обновления attendance
8. ✅ Добавить обработку удаления attendance (удаление staff_journal_entries)
9. ✅ Добавить инвалидацию кэша для staff_journal_entries
10. ✅ Протестировать на активности "Прескул"

## Ожидаемый результат

После реализации:
- ✅ При отметке посещаемости создаются `staff_journal_entries` для педагогов
- ✅ Начисления отображаются в финансовой истории педагога
- ✅ Начисления учитываются в балансах
- ✅ `finance_transactions` типа `salary` создаются автоматически (если есть триггеры) или вручную
