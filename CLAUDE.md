# Правила проекта

## Язык общения

Всегда отвечай на **русском языке**, независимо от языка запроса.

---

## Стек.
React 18 + TypeScript + Vite, Supabase (PostgreSQL / PostgREST), TanStack React Query v5.

---

## Обязательные правила

### 1. Postres/PostgREST — лимит 1000 строк

PostgREST возвращает **максимум 1000 строк** по умолчанию. Превышение лимита не бросает ошибку — данные молча обрезаются. Это приводит к исчезновению записей в UI.

**Правило:** любой запрос к Supabase, который может вернуть > 1000 строк (журналы, транзакции, история посещаемости), **обязан** использовать `fetchAllRows` из `src/lib/supabasePagination.ts`.

```ts
import { fetchAllRows } from '@/lib/supabasePagination';

const rows = await fetchAllRows((from, to) =>
  supabase
    .from('attendance')
    .select('*')
    .eq('activity_id', activityId)
    .range(from, to)
);
```

Функция загружает данные страницами по 999 строк и возвращает полный массив.

Уже применено в: `useAttendance`, `useFinanceTransactions`, `useAccountBalances`, `useSummaryReport`, `useFinancialSummaryReport`.

---

### 2. Парсинг дат

Строки в формате `YYYY-MM-DD` **нельзя** передавать напрямую в `new Date(str)` — это вызывает UTC-парсинг и сдвиг на 1 день в часовых поясах UTC+N.

**Правило:** всегда парсить через `.split('-')`:

```ts
const [y, m, d] = date.split('-').map(Number);
const dateObj = new Date(y, m - 1, d); // локальная таймзона
```

Уже применено в: `src/lib/attendance.ts` (функции `getDaysInMonth`, `formatDateString`, etc.), `src/lib/gardenAttendance.ts`.

---

### 3. Стабильность ссылок в useMemo / useEffect

Значения `new Date()`, вычисляемые на уровне компонента вне хука, пересоздаются при каждом рендере и ломают зависимости `useMemo`.

**Правило:** если текущая дата нужна как точка отсчёта при монтировании компонента — использовать `useRef(new Date())`.

```ts
const nowRef = useRef(new Date());
const days = useMemo(() => filterDaysByPeriod(allDays, period, nowRef.current), [allDays, period]);
```

---

### 4. Оптимистичный UI + React Query

При паттерне "optimistic override + mutateAsync":
- `optimisticOverrides` удаляется в `.finally()` после `mutateAsync`
- До этого момента кеш attendance **должен** быть обновлён свежими данными
- Используй `await queryClient.refetchQueries({ queryKey: ['attendance'], type: 'active' })` внутри `onSuccess` мутации, а не просто `invalidateQueries`

`invalidateQueries` помечает кеш как stale, но **не ждёт** завершения рефетча. `refetchQueries` ждёт.

---

### 5. Сад / Garden Attendance Journal v1

- Контроллер-активность определяется наличием `config.base_tariff_ids` (массив UUID)
- Начисление: `M / D` где M = тариф за месяц, D = рабочих дней в месяце (пн–пт)
- При статусе `absent`: начисление = `(M / D) - F`, где F = дневная стоимость питания
- Транзакции создаются для `baseTariffActivity`, а не для контроллер-активности
- `useSetAttendance.onSuccess` создаёт транзакцию для **контроллер**-активности — это отдельная логика (legacy), не конфликтует
