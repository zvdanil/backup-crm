# Архитектура проекта KinderCRM (Iris)

Документ предназначен для быстрого погружения в проект: ключевые блоки, логика, БД, потоки данных, роли и экраны.

---

## 1) Стек и каркас

- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Data**: Supabase (Postgres + Auth)
- **State/Data fetching**: React Query

Базовые файлы:
- `src/main.tsx` — вход приложения.
- `src/App.tsx` — маршрутизация, провайдеры, ProtectedRoute.
- `src/components/layout/AppLayout.tsx` — шапка, меню, навигация.
- `src/components/layout/PageHeader.tsx` — заголовки страниц.

---

## 2) Авторизация и роли

**Файлы:**
- `src/context/AuthContext.tsx` — сессия, профили, роли, активация, OAuth.
- `src/components/auth/ProtectedRoute.tsx` — защита роутов по ролям.
- `src/lib/permissions.ts` — матрица доступа по разделам.

**Логика:**
- При первом входе создаётся `user_profiles`.
- Первый пользователь = `owner`, активен.
- Остальные = `viewer`, **ожидают активации** (`is_active=false`), пока админ не включит.

**Роли:**
Owner, Admin, Manager, Accountant, Viewer, Parent.

---

## 3) Интеграция с Supabase

**Файлы:**
- `src/integrations/supabase/client.ts` — клиент.
- `src/integrations/supabase/types.ts` — типы БД.
- `supabase/migrations/*.sql` — миграции.

**Ключевые миграции:**
- роли/профили/кабинет родителя
- платёжные счета
- подкатегории расходов
- видимость активностей у детей
- `balance_display_mode`

---

## 4) Ключевые модули (hooks)

**Дети/активности/зачисления**
- `useStudents.ts`, `useActivities.ts`, `useEnrollments.ts`

**Посещаемость**
- `useAttendance.ts` — CRUD отметок
- `lib/attendance.ts` — даты/форматы/утилиты
- `lib/gardenAttendance.ts` — расчёт садкового журнала

**Финансы**
- `useFinanceTransactions.ts` — транзакции/балансы
- `lib/activityPrice.ts` — цены/скидки
- `lib/salaryCalculator.ts` — расчёт зарплаты

**Персонал**
- `useStaff.ts`, `useStaffBilling.ts`

**Родители**
- `useParentPortal.ts`, `useParentLinks.ts`, `useStudentAttendance.ts`

---

## 5) Экранная карта (основные страницы)

- Дашборд — `src/pages/EnhancedDashboard.tsx`
- Журнал (обычный) — `src/pages/Attendance.tsx`
- Журнал відвідування v1 — `src/pages/GardenAttendanceJournal.tsx`
- Відомість харчування — `src/pages/NutritionReport.tsx`
- Діти — `src/pages/Students.tsx`
- Деталь ребёнка — `src/pages/StudentDetail.tsx`
- Активності — `src/pages/Activities.tsx`
- Журнал витрат по активностям — `src/pages/ActivityExpenseJournal.tsx`
- Групи — `src/pages/Groups.tsx`
- Персонал — `src/pages/Staff.tsx`, `src/pages/StaffDetail.tsx`
- Журнал витрат персонала — `src/pages/StaffExpenseJournal.tsx`
- Ведомость зарплаты — `src/pages/StaffPayrollRegistry.tsx`
- Рахунки — `src/pages/Accounts.tsx`
- Користувачі — `src/pages/Users.tsx`
- Login — `src/pages/Login.tsx`
- Кабинет родителя — `src/pages/ParentPortal.tsx`, `src/pages/ParentStudentDetail.tsx`

---

## 6) База данных: ключевые таблицы

**Основные**
- `students`, `groups`, `activities`, `enrollments`, `attendance`

**Финансы**
- `finance_transactions`
- `payment_accounts`
- `expense_categories`

**Персонал**
- `staff`, `staff_billing_rules`, `staff_journal_entries`, `staff_payouts`

**Авторизация**
- `user_profiles`, `parent_student_links`
- enum `user_role`
- enum `balance_display_mode`

---

## 7) Потоки данных (критические сценарии)

### A) Журнал посещений (обычный)
1. Клик по ячейке → запись в `attendance`.
2. `charged_amount/value` сохраняются.
3. Дашборд и балансы получают данные из `attendance` и `finance_transactions`.

### B) Журнал відвідування v1 (садок)
1. Клик по статусу → `handleStatusChange`.
2. `calculateDailyAccrual` рассчитывает базовые и харчування тарифы.
3. Создаются `finance_transactions` по базовым/food активностям.

### C) Баланс ребёнка
`useStudentTotalBalance` и `useStudentAccountBalances`:
- учитывают `balance_display_mode`
- исключают контроллер‑активности
- суммируют по счетам + “Без рахунку”

### D) Зарплаты
`attendance` → `staff_journal_entries` → `staff_payouts`  
Дашборд учитывает `salary` отдельно.

### E) Авторизация
OAuth → `user_profiles` → роль/активация → `ProtectedRoute`.

---

## 8) Роли и доступы (кратко)

- **Owner**: полный доступ ко всему.
- **Admin**: всё, кроме смены Owner.
- **Manager**: дети, журналы, оплаты.
- **Accountant**: финансы/зарплаты.
- **Viewer**: просмотр.
- **Parent**: только свой ребёнок (просмотр).

Подробная матрица доступа находится в `src/lib/permissions.ts`.

---

## 9) Ключевые UI‑компоненты

- `src/components/attendance/*` — клетки, сетки журналов.
- `src/components/students/*` — карточка ребёнка/история.
- `src/components/activities/*` — карточка/форма активности.
- `src/components/accounts/*` — платёжные счета.
- `src/components/ui/*` — базовые UI‑компоненты shadcn.

---

## 10) Мобильные особенности

Компоненты учитывают мобильные режимы через `useIsMobile`, с переходом на карточки/упрощённые таблицы.

---

## 11) Визуальные фичи

- Выходные дни подсвечиваются во всех журналах.
- В журнале v1: липкая строка дат + синхронный скролл.
- В дашборде: липкие даты и отдельные таблицы с синхронным скроллом.

---

## 12) Быстрый сценарий понимания проекта

1. **Открой `App.tsx`** → увидишь все ключевые страницы.
2. **`AuthContext` + `permissions.ts`** → роли/доступ.
3. **`useFinanceTransactions` + `useStudentAccountBalances`** → финансовая логика.
4. **`GardenAttendanceJournal` + `gardenAttendance.ts`** → специфическая логика сада.
5. **`EnhancedDashboard`** → сводная логика и расчёты.

---

Если нужно — могу добавить:
- графическую ER‑схему,
- диаграмму потоков данных,
- операционный сценарий “день администратора”.
