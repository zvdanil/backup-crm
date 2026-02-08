# Быстрая справка по проекту

## 🚀 Быстрый старт

```bash
npm install
npm run dev  # http://localhost:8080
```

## 📋 Ключевая информация

| Параметр                | Значение                                     |
| ----------------------- | -------------------------------------------- |
| **Проект**              | backup-crm (CRM для образовательного центра) |
| **Branch**              | test-srm-iris                                |
| **Frontend**            | React + TypeScript + Vite                    |
| **UI**                  | shadcn-ui + Tailwind                         |
| **Backend**             | Supabase (PostgreSQL + Auth)                 |
| **Deploy**              | Railway                                      |
| **Supabase Project ID** | qtphickigswerhvintvh                         |
| **Последний коммит**    | 9792073 (remove debug logs)                  |

## 🔑 Основные файлы

```
src/
├── pages/Users.tsx              # Управление пользователями
├── hooks/useUserProfiles.ts     # Хуки для работы с профилями
├── context/AuthContext.tsx      # Контекст аутентификации
├── integrations/supabase/
│   ├── client.ts                # Supabase клиент
│   └── types.ts                 # Типы БД
└── components/
    ├── ui/                      # shadcn-ui компоненты
    └── [domain]/                # Доменные компоненты

supabase/
├── config.toml                  # Конфигурация проекта
└── functions/create-user/       # Edge Function (не используется)

.env                             # Переменные окружения
vite.config.ts                   # Конфигурация Vite
package.json                     # Зависимости
```

## 🔐 Роли пользователей

| Роль              | Описание          | Доступ              |
| ----------------- | ----------------- | ------------------- |
| `owner`           | Владелец          | Полный доступ       |
| `admin`           | Администратор     | Почти полный доступ |
| `manager`         | Менеджер          | Ученики + группы    |
| `accountant`      | Бухгалтер         | Финансы             |
| `viewer`          | Наблюдатель       | Только чтение       |
| `parent`          | Родитель          | Портал родителя     |
| `newregistration` | Новая регистрация | Ожидание активации  |

## 📝 Основные команды

### Development

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run preview      # Preview build
npm run lint         # ESLint
```

### Git

```bash
git status
git add .
git commit -m "message"
git push origin test-srm-iris
```

### Supabase CLI

```bash
supabase login
supabase link --project-ref qtphickigswerhvintvh
supabase functions deploy create-user
```

## 🌐 Переменные окружения

```env
VITE_SUPABASE_PROJECT_ID=qtphickigswerhvintvh
VITE_SUPABASE_URL=https://qtphickigswerhvintvh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsIn...
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_LQZwutg-thrQOGsqiwgUvw_4r6BmHQE
```

## 🐛 Последняя решённая проблема

**Проблема:** 401 при создании пользователей через Edge Function

**Решение:** Переход на `supabase.auth.signUp()` с восстановлением сессии администратора

**Коммит:** 9011d65 - "публічна реєстрація 2"

**Детали:** См. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#81-проблема-401-при-создании-пользователей-через-edge-function)

## 📊 Структура БД (основные таблицы)

1. `user_profiles` - профили пользователей
2. `students` - ученики
3. `groups` - группы
4. `staff` - персонал
5. `accounts` - финансовые счета
6. `activities` - виды активностей
7. `enrollments` - записи учеников
8. `attendance` - посещаемость
9. `finance_transactions` - финансовые транзакции
10. `calendar_events` - календарные события

**Полная схема:** См. `database_schema.sql` и `database_schema.md`

## 📚 Документация

| Файл                                               | Описание                    |
| -------------------------------------------------- | --------------------------- |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)           | **Полный контекст проекта** |
| [README.md](README.md)                             | Базовая информация          |
| [AUTH_FIXES_README.md](AUTH_FIXES_README.md)       | Исправления auth            |
| [DEPLOY_EDGE_FUNCTION.md](DEPLOY_EDGE_FUNCTION.md) | Деплой Edge Functions       |
| [DATABASE_SCHEMA.md](database_schema.md)           | Схема БД                    |

## 🔧 Важные хуки

```typescript
// src/hooks/useUserProfiles.ts
useUserProfiles(); // Получить список пользователей
useUpdateUserProfile(); // Обновить профиль
useCreateUser(); // Создать пользователя (через signUp)
```

## 🎨 UI Компоненты

Используется **shadcn-ui** (Radix UI + Tailwind)

Все компоненты в `src/components/ui/`:

- Button, Input, Select, Dialog, Table
- Form, Label, Toast
- Accordion, Tabs, Card
- и многие другие...

## 🚀 Deployment

### Railway (Auto)

1. Push в `test-srm-iris`
2. Railway автоматически деплоит
3. Если не деплоит: `git commit --allow-empty -m "chore: trigger deploy"`

### Supabase

- БД и Auth уже настроены
- Edge Functions: `supabase functions deploy [name]`

## 📞 Полезные ссылки

- **GitHub:** https://github.com/zvdanil/backup-crm
- **Supabase Dashboard:** https://supabase.com/dashboard/project/qtphickigswerhvintvh

---

**Для полной информации см.** [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
