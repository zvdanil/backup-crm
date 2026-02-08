# Контекст проекта backup-crm

**Дата обновления:** 8 февраля 2026  
**Текущий branch:** test-srm-iris  
**Последний коммит:** 9792073 - "chore: remove debug logs from users page"

---

## 1. Общая информация

**Название проекта:** backup-crm  
**Тип:** CRM система для управления образовательным центром  
**Статус:** Production (развёрнуто на Railway)  
**Репозиторий:** https://github.com/zvdanil/backup-crm.git

### Описание
Система управления учениками, группами, занятиями, финансами и персоналом образовательного центра. Включает функционал для родителей, администраторов, бухгалтеров и владельцев.

---

## 2. Технологический стек

### Frontend
- **Framework:** React 18 + TypeScript
- **Build tool:** Vite
- **UI библиотека:** shadcn-ui (Radix UI + Tailwind CSS)
- **State management:** TanStack Query (React Query) v5.83.0
- **Routing:** React Router
- **Forms:** React Hook Form + Zod validation
- **Стилизация:** Tailwind CSS + class-variance-authority

### Backend & Infrastructure
- **BaaS:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Project ID:** qtphickigswerhvintvh
- **URL:** https://qtphickigswerhvintvh.supabase.co
- **Deployment:** Railway (frontend)
- **API:** Vercel (опциональные serverless функции)

### Основные зависимости
```json
{
  "@supabase/supabase-js": "^2.90.1",
  "@tanstack/react-query": "^5.83.0",
  "@hookform/resolvers": "^3.10.0",
  "@radix-ui/*": "множество компонентов",
  "lucide-react": "^0.462.0",
  "date-fns": "^3.6.0",
  "embla-carousel-react": "^8.6.0"
}
```

---

## 3. Архитектура проекта

### Структура директорий

```
backup-crm/
├── src/
│   ├── components/          # UI компоненты
│   │   ├── ui/             # shadcn-ui компоненты
│   │   ├── accounts/       # Компоненты для счетов
│   │   ├── activities/     # Компоненты для активностей
│   │   ├── attendance/     # Компоненты учёта посещений
│   │   ├── auth/           # Компоненты аутентификации
│   │   ├── dashboard/      # Компоненты дашборда
│   │   ├── enrollments/    # Компоненты записей
│   │   ├── finance/        # Финансовые компоненты
│   │   ├── group-lessons/  # Групповые занятия
│   │   ├── groups/         # Управление группами
│   │   ├── layout/         # Компоненты макета
│   │   ├── staff/          # Компоненты персонала
│   │   └── students/       # Компоненты студентов
│   ├── context/            # React Context провайдеры
│   │   └── AuthContext.tsx # Аутентификация и авторизация
│   ├── hooks/              # Custom React hooks
│   │   ├── useUserProfiles.ts
│   │   ├── use-toast.tsx
│   │   └── use-mobile.tsx
│   ├── integrations/
│   │   └── supabase/       # Supabase интеграция
│   │       ├── client.ts   # Supabase клиент
│   │       └── types.ts    # TypeScript типы из БД
│   ├── lib/                # Утилиты
│   ├── pages/              # Страницы приложения
│   │   ├── Index.tsx
│   │   ├── Login.tsx
│   │   ├── Users.tsx       # Управление пользователями
│   │   ├── Students.tsx
│   │   ├── Groups.tsx
│   │   ├── Staff.tsx
│   │   ├── Accounts.tsx
│   │   ├── Activities.tsx
│   │   ├── Attendance.tsx
│   │   ├── EnhancedDashboard.tsx
│   │   ├── ParentPortal.tsx
│   │   └── ...
│   ├── day-calendar-view/  # Календарный компонент
│   └── main.tsx            # Entry point
├── supabase/
│   ├── config.toml         # Конфигурация проекта
│   └── functions/          # Edge Functions
│       └── create-user/    # Функция создания пользователей
│           ├── index.ts
│           └── config.toml
├── api/                    # Vercel serverless функции (опционально)
├── scripts/                # Утилиты и скрипты
├── docs/                   # Документация
├── public/                 # Статические файлы
├── .env                    # Переменные окружения
├── vite.config.ts          # Конфигурация Vite
├── vercel.json             # Конфигурация Vercel
├── package.json
└── [множество .sql и .md файлов для миграций и документации]
```

### Основные страницы (Routes)

| Route | Компонент | Описание | Доступ |
|-------|-----------|----------|--------|
| `/` | EnhancedDashboard | Главная панель с аналитикой | Все авторизованные кроме parent |
| `/parent-portal` | ParentPortal | Портал для родителей | parent |
| `/login` | Login | Страница входа | Публичная |
| `/users` | Users | Управление пользователями | owner, admin |
| `/students` | Students | Управление учениками | owner, admin, manager |
| `/groups` | Groups | Управление группами | owner, admin, manager |
| `/staff` | Staff | Управление персоналом | owner, admin |
| `/accounts` | Accounts | Финансовые счета | owner, admin, accountant |
| `/activities` | Activities | Виды активностей | owner, admin, manager |
| `/attendance` | Attendance | Учёт посещений | owner, admin, manager |
| `/calendar` | Calendar | Календарь занятий | Все авторизованные |
| `/pending-activation` | PendingActivation | Ожидание активации | newregistration |
| ... | ... | ... | ... |

---

## 4. Аутентификация и авторизация

### Роли пользователей (UserRole)
```typescript
type UserRole = 
  | "owner"           // Владелец - полный доступ
  | "admin"           // Администратор - почти полный доступ
  | "manager"         // Менеджер - управление учениками и группами
  | "accountant"      // Бухгалтер - финансовый доступ
  | "viewer"          // Наблюдатель - только чтение
  | "parent"          // Родитель - портал родителя
  | "newregistration" // Новая регистрация - ожидание активации
```

### AuthContext
- **Файл:** `src/context/AuthContext.tsx`
- **Функции:**
  - `signInWithPassword(email, password)` - вход
  - `signUp(email, password, parentName, childName)` - регистрация
  - `signOut()` - выход
- **Состояние:**
  - `user` - текущий пользователь Supabase
  - `session` - текущая сессия
  - `profile` - профиль из таблицы user_profiles
  - `role` - роль пользователя
  - `isLoading` - статус загрузки

### Supabase Auth
- **Таблица:** `user_profiles`
- **Колонки:**
  - `id` (UUID, FK к auth.users)
  - `full_name` (text)
  - `parent_name` (text)
  - `child_name` (text)
  - `role` (user_role enum)
  - `is_active` (boolean)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

---

## 5. Ключевые компоненты и хуки

### useUserProfiles.ts
**Расположение:** `src/hooks/useUserProfiles.ts`

**Функции:**
```typescript
// Получение списка пользователей
useUserProfiles(): UseQueryResult<UserProfile[]>

// Обновление профиля
useUpdateUserProfile(): UseMutationResult<UserProfile>

// Создание пользователя (через signUp)
useCreateUser(): UseMutationResult<UserProfile>
```

**Особенности:**
- `useCreateUser` использует `supabase.auth.signUp()` вместо Edge Function
- После signUp восстанавливает сессию администратора
- Автоматически инвалидирует кэш TanStack Query

### Users.tsx
**Расположение:** `src/pages/Users.tsx`

**Функции:**
- Отображение таблицы пользователей
- Форма создания нового пользователя (Dialog)
- Редактирование роли и статуса активации
- Только owner может редактировать

**Валидация:**
```typescript
const createUserSchema = z.object({
  email: z.string().email("Невірний формат email"),
  password: z.string().min(6, "Пароль має бути мінімум 6 символів"),
  parentName: z.string().min(1, "ФІО батька обов'язкове"),
  childName: z.string().min(1, "ФІО дитини обов'язкове"),
  role: z.enum([...]),
  isActive: z.boolean(),
});
```

---

## 6. Конфигурация

### Переменные окружения (.env)
```env
VITE_SUPABASE_PROJECT_ID=qtphickigswerhvintvh
VITE_SUPABASE_URL=https://qtphickigswerhvintvh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsIn...
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_LQZwutg-thrQOGsqiwgUvw_4r6BmHQE
```

### Supabase Config (supabase/config.toml)
```toml
project_id = "qtphickigswerhvintvh"
```

### Vite Config (vite.config.ts)
- **Dev server:** порт 8080, host `::`
- **Proxy:** `/api` → `VITE_API_URL` или `http://localhost:3000`
- **Plugins:** react-swc, lovable-tagger (dev only)
- **Alias:** `@` → `./src`

### Vercel Config (vercel.json)
```json
{
  "devCommand": "vite --port 8080 --strictPort false",
  "framework": null,
  "rewrites": [
    {
      "source": "/((?!api|_next|.*\\..*|assets).*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 7. Последние изменения (Git History)

### Последние 10 коммитов:
```
9792073 (HEAD -> test-srm-iris, origin/test-srm-iris) chore: remove debug logs from users page
0903e09 chore: trigger Railway deploy
9011d65 публічна реєстрація 2
029da2a Публічна реєстрація юзера
a1db55a тест 4
f7b72c6 test3
ea6c7ab тест2
f0107a4 тест
c075a33 fix: use env variables for Supabase URL and key
994c6b5 fix: use direct fetch for Edge Function with explicit Authorization header
```

### Статус репозитория:
```
Branch: test-srm-iris
Status: up to date with origin/test-srm-iris
Working tree: clean (нет uncommitted changes)
```

---

## 8. Проблемы и решения

### 8.1 Проблема: 401 при создании пользователей через Edge Function

**Описание:**
- При попытке создать пользователя через Edge Function `create-user` возникала ошибка 401
- Проблема сохранялась несмотря на правильные JWT токены и apikey
- Headers присутствовали в Network но не доходили до функции
- Попытки с `verify_jwt=false` не помогли

**Попытки решения:**
1. ✗ Проверка JWT payload (iss field корректен)
2. ✗ Верификация apikey (совпадает с Dashboard)
3. ✗ Различные подходы auth в Edge Function (admin client, ANON_KEY client)
4. ✗ Создание config.toml с `verify_jwt=false`
5. ✗ Исправление project_id в supabase/config.toml

**Финальное решение:**
- **Переход на прямой `supabase.auth.signUp()`** в `useCreateUser` hook
- Сохранение сессии администратора перед signUp
- Восстановление сессии администратора после signUp
- Пользователь создаётся с `role="newregistration"` и `is_active=false`
- После одобрения администратор меняет роль и активирует

**Реализация:**
```typescript
// src/hooks/useUserProfiles.ts
export function useCreateUser() {
  return useMutation({
    mutationFn: async (userData: CreateUserData) => {
      // Сохраняем сессию админа
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      
      // Создаём пользователя
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            parent_name: userData.parentName,
            child_name: userData.childName,
            full_name: userData.parentName,
          },
        },
      });
      
      // Восстанавливаем сессию админа
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
      
      return { /* user profile */ };
    },
  });
}
```

**Статус:** ✅ Решено (коммит 9011d65)

---

### 8.2 Edge Function create-user

**Файл:** `supabase/functions/create-user/index.ts`

**Статус:** ⚠️ Не используется (заменён на signUp)

**Содержимое:** 
- Содержит тестовый return для диагностики
- Основной код закомментирован/недостижим
- Оставлен для истории и возможной отладки

**Config:**
```toml
# supabase/functions/create-user/config.toml
verify_jwt = false
```

**Примечание:** Может быть удалён или переработан в будущем.

---

### 8.3 Railway Deployment

**Проблема:**
- Railway не всегда автоматически деплоит при push

**Решение:**
- Пустой коммит для триггера: `git commit --allow-empty -m "chore: trigger Railway deploy"`
- Альтернатива: вручную через Railway Dashboard

**Последний деплой:**
- Коммит: 9792073
- Содержание: Удаление debug logs из Users.tsx
- Статус: ✅ Завершён

---

## 9. Database Schema (краткий обзор)

### Основные таблицы:

1. **user_profiles** - профили пользователей
2. **students** - ученики
3. **groups** - группы
4. **staff** - персонал
5. **accounts** - финансовые счета
6. **activities** - виды активностей (предметы)
7. **enrollments** - записи учеников на активности
8. **attendance** - посещаемость
9. **finance_transactions** - финансовые транзакции
10. **calendar_events** - календарные события
11. **staff_journal** - журнал работы персонала
12. **debtor_registry** - реестр должников

**Детальная схема:** См. `database_schema.sql` и `database_schema.md`

---

## 10. Скрипты и команды

### NPM Scripts
```bash
npm run dev          # Запуск dev server (Vite)
npm run build        # Production build
npm run build:dev    # Development build
npm run preview      # Preview production build
npm run lint         # ESLint
```

### Важные скрипты
- `create_backup.ps1` - PowerShell скрипт создания бэкапа БД
- `scripts/` - различные утилиты

### Git workflow
```bash
git status
git add .
git commit -m "message"
git push origin test-srm-iris
```

---

## 11. Документация

### Основные документы:
- `README.md` - базовая информация
- `PROJECT_CONTEXT.md` - этот файл (полный контекст)
- `AUTH_FIXES_README.md` - исправления аутентификации
- `DEPLOY_EDGE_FUNCTION.md` - деплой Edge Functions
- `DATABASE_SCHEMA.md` - схема БД
- `DASHBOARD_SYNC_ISSUES_ANALYSIS.md` - анализ проблем дашборда
- `FIX_USER_REGISTRATION_ISSUES.md` - проблемы регистрации
- `CORS_*.md` - документация по CORS
- `STAFF_FINANCIAL_CALENDAR_ROWS_LOGIC.md` - логика финансового календаря

### SQL скрипты:
- `APPLY_*.sql` - миграции
- `CHECK_*.sql` - проверки данных
- `FIX_*.sql` - исправления
- `CLEANUP_*.sql` - очистка данных
- `TEST_*.sql` - тестовые запросы
- `backup_*.sql` - бэкапы

---

## 12. Development Setup

### Требования:
- Node.js (рекомендуется через nvm)
- npm или yarn
- Git
- Supabase CLI (опционально)
- Vercel CLI (если используются API routes)

### Установка:
```bash
# 1. Клонировать репозиторий
git clone https://github.com/zvdanil/backup-crm.git
cd backup-crm

# 2. Установить зависимости
npm install

# 3. Создать .env файл (использовать .env как пример)
# Добавить переменные Supabase

# 4. Запустить dev server
npm run dev

# Приложение будет доступно на http://localhost:8080
```

### Работа с Supabase:
```bash
# Логин в Supabase CLI
supabase login

# Линк к проекту
supabase link --project-ref qtphickigswerhvintvh

# Deploy функций
supabase functions deploy create-user

# Генерация типов
supabase gen types typescript --project-id qtphickigswerhvintvh > src/integrations/supabase/types.ts
```

---

## 13. Production Deployment

### Railway (Frontend)
1. Push в branch `test-srm-iris`
2. Railway автоматически деплоит (или триггер пустым коммитом)
3. Проверить логи в Railway Dashboard

### Supabase (Backend)
- БД и Auth уже настроены
- Edge Functions деплоятся через Supabase CLI
- Миграции применяются через SQL Editor в Dashboard

---

## 14. Текущие TODO и планы

### Краткосрочные:
- [ ] Протестировать создание пользователей на production после деплоя
- [ ] Убедиться что signUp approach работает корректно
- [ ] Мониторинг ошибок в production

### Долгосрочные:
- [ ] Удалить или переработать Edge Function create-user
- [ ] Оптимизация запросов к БД
- [ ] Добавить E2E тесты
- [ ] Улучшить типизацию TypeScript
- [ ] Рефакторинг больших компонентов

---

## 15. Контакты и ресурсы

- **GitHub:** https://github.com/zvdanil/backup-crm
- **Supabase Dashboard:** https://supabase.com/dashboard/project/qtphickigswerhvintvh
- **Railway:** [ссылка на Railway проект]
- **Production URL:** [URL Railway app]

---

## 16. Заметки

- Проект был создан на основе Lovable template
- Используется shadcn-ui для компонентов
- TanStack Query для server state
- Проект активно развивается и поддерживается
- Branch `test-srm-iris` - основной для разработки

---

**Последнее обновление:** 8 февраля 2026  
**Автор документации:** GitHub Copilot  
**Версия:** 1.0
