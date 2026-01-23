# Исправление проблемы обновления данных в дашборде

## Проблема
Новые данные из журналов посещения не попадают в дашборд после создания/обновления записей посещаемости.

## Анализ проблемы

### Найденные проблемы:

1. **`refetchQueries` с `type: 'active'`** - основная проблема
   - `refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' })` перезапрашивает только активные запросы
   - Если дашборд не в фокусе (не активен), он не перезапросится
   - Это означает, что данные не обновляются, если пользователь находится на другой странице

2. **Зависимости в `useMemo`**
   - `attendanceMap` зависел от `data?.attendance?.length`, что избыточно
   - Если `data?.attendance` меняется, то и его длина меняется автоматически

3. **Порядок операций в `handleRefresh`**
   - `refetchDashboard()` и `refetchSummary()` вызывались до `refetchQueries`
   - Это могло приводить к конфликтам

## Исправления

### 1. Убрано ограничение `type: 'active'` из `refetchQueries`

**Файлы:**
- `src/hooks/useAttendance.ts` - `useSetAttendance` и `useDeleteAttendance`
- `src/pages/GardenAttendanceJournal.tsx` - `handleStatusChange`
- `src/hooks/useFinanceTransactions.ts` - `useUpsertFinanceTransaction`
- `src/pages/EnhancedDashboard.tsx` - `handleRefresh`

**Было:**
```typescript
await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' });
```

**Стало:**
```typescript
await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
```

Теперь перезапрашиваются ВСЕ запросы дашборда, а не только активные.

### 2. Улучшена функция `handleRefresh`

**Было:**
```typescript
const handleRefresh = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
    refetchDashboard(),
    refetchSummary(),
  ]);
  await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' });
};
```

**Стало:**
```typescript
const handleRefresh = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['attendance'] }),
    queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
  ]);
  await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
  await Promise.all([refetchDashboard(), refetchSummary()]);
};
```

Теперь:
1. Сначала инвалидируются все запросы
2. Затем перезапрашиваются все запросы дашборда
3. Затем вызываются прямые refetch для гарантии

### 3. Упрощены зависимости в `attendanceMap`

**Было:**
```typescript
}, [data?.attendance, dataUpdatedAt, data?.attendance?.length]);
```

**Стало:**
```typescript
}, [data?.attendance, dataUpdatedAt]);
```

Убрана избыточная зависимость `data?.attendance?.length`.

## Результат

После этих исправлений:
1. Данные дашборда обновляются автоматически при создании/обновлении посещаемости
2. Кнопка "Оновити дані" работает корректно
3. Данные обновляются даже если дашборд не в фокусе

## Тестирование

Для проверки:
1. Откройте дашборд
2. Откройте журнал посещения в другой вкладке/окне
3. Добавьте новую запись посещаемости
4. Вернитесь на дашборд - данные должны обновиться автоматически
5. Если не обновились, нажмите кнопку "Оновити дані"
