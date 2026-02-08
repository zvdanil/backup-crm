# Changelog

Все значимые изменения в проекте backup-crm.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [Unreleased]

### В разработке
- Оптимизация производительности запросов к БД
- E2E тесты критических путей
- Улучшение типизации TypeScript

---

## [2026-02-08] - Cleanup Debug Code

### Удалено
- **[9792073]** Удалены debug logs из Users.tsx
  - Убраны console.log
  - Удалён неиспользуемый onCreateUserInvalid handler
  - Убран неиспользуемый import supabase

### Исправлено
- **[0903e09]** Триггер Railway deploy через empty commit

### Контекст
После решения проблемы с созданием пользователей был выполнен cleanup кода от отладочных элементов.

---

## [2026-02-07] - User Creation Fix (Публічна реєстрація)

### Добавлено
- **[9011d65]** Новый подход к созданию пользователей через `supabase.auth.signUp()`
  - Реализован в `src/hooks/useUserProfiles.ts`
  - Сохранение сессии администратора перед signUp
  - Восстановление сессии администратора после signUp
  - Пользователь создаётся с `role="newregistration"` и `is_active=false`

### Изменено
- **[029da2a]** Публічна реєстрація юзера (предыдущая попытка)
- **[a1db55a - f0107a4]** Тестовые коммиты для отладки Edge Function

### Исправлено
- **[c075a33]** Использование env переменных для Supabase URL и key
- **[994c6b5]** Прямой fetch для Edge Function с явным Authorization header
- **[5eb3bb8]** Использование admin.getUser(jwt) для auth в Edge Function
- **[f08d028]** Тестовое логирование Supabase
- **[5f959d7]** Удаление ручного Authorization header (пусть SDK управляет)
- **[aca3948]** Использование ANON_KEY клиента для user auth в Edge Function
- **[9c9a7ff]** Добавление Authorization header к Edge Function call

### Контекст
**Проблема:** 401 ошибка при попытке создать пользователя через Edge Function create-user.

**Попытки решения:**
1. Различные подходы аутентификации в Edge Function
2. Проверка JWT токенов и headers
3. Создание config.toml с verify_jwt=false
4. Исправление project_id в supabase/config.toml

**Финальное решение:** Замена Edge Function на прямой `supabase.auth.signUp()` с сохранением/восстановлением сессии администратора.

**Время отладки:** ~3+ часа

**Коммиты:** 994c6b5 → 9011d65 (множество попыток)

---

## [2026-02-07] - Edge Function Implementation

### Добавлено
- **[9e908c1]** Использование Supabase Edge Function для создания пользователей
  - Создан `supabase/functions/create-user/index.ts`
  - CORS поддержка
  - Проверка роли (owner/admin)
  - Использование Admin API для создания пользователей

### Изменено
- **[ae79c39]** Code formatting

### Документация
- Добавлено множество .md файлов с инструкциями по Edge Functions
  - DEPLOY_EDGE_FUNCTION.md
  - EDGE_FUNCTION_DASHBOARD_GUIDE.md
  - EDGE_FUNCTION_SETUP.md

### Контекст
Попытка решить проблемы с rate limits и улучшить безопасность создания пользователей через серверную Edge Function.

---

## [2026-02-07] - User Creation Fixes

### Исправлено
- **[412adef]** Ремонт создания пользователя (попытка 1)
- **[be20622]** Мелкие исправления

### Контекст
Первые попытки исправить проблемы с созданием пользователей.

---

## [2026-02-07] - Debitor Registry

### Добавлено
- **[de4ae05]** Добавлена страница Debitorka (реестр должников)
  - Новая страница для отслеживания задолженностей
  - Интеграция с finance_transactions

---

## [Предыдущие версии]

### Основные features (реализованы ранее)

#### Аутентификация и авторизация
- Supabase Auth интеграция
- Множественные роли пользователей
- Protected routes
- Session management
- AuthContext для глобального состояния

#### Управление пользователями
- CRUD операции для user_profiles
- Таблица пользователей с сортировкой
- Редактирование ролей и статуса активации
- Pending activation страница

#### Управление учениками
- CRUD операции для students
- Детальная страница студента
- История платежей
- Балансы по активностям
- Связь с родителями (user_profiles)

#### Управление группами
- CRUD операции для groups
- Расписание групп
- Связь с active и enrolled students
- Календарь занятий

#### Управление персоналом
- CRUD операции для staff
- Детальная страница персонала
- Staff journal (журнал работы)
- Расчёт зарплаты
- Staff payroll registry

#### Финансы
- Finance transactions (доходы/расходы)
- Accounts (финансовые счета)
- Payment history
- Распределение платежей (distribute_payment function)
- Пересчёт балансов (recalculate_balances function)
- Debtor registry (реестр должников)

#### Посещаемость
- Attendance tracking
- Garden attendance journal
- Group lessons journal
- Activity expense journal
- Календарный вид посещаемости

#### Dashboard
- Enhanced Dashboard с аналитикой
- Summary Report
- Nutrition Report
- Статистика по студентам, группам, финансам

#### Родительский портал
- Parent Portal для родителей
- Просмотр информации о детях
- История платежей
- Расписание занятий

#### UI/UX
- shadcn-ui компоненты
- Responsive design
- Dark/Light theme support (планируется)
- Toast notifications
- Loading states
- Error handling

#### Технические улучшения
- TypeScript strict mode
- TanStack Query для state management
- React Hook Form + Zod validation
- Vite для build
- ESLint конфигурация

---

## Статистика коммитов (последние 20)

```
9792073 | 2026-02-08 | chore: remove debug logs from users page
0903e09 | 2026-02-08 | chore: trigger Railway deploy
9011d65 | 2026-02-07 | публічна реєстрація 2
029da2a | 2026-02-07 | Публічна реєстрація юзера     
a1db55a | 2026-02-07 | тест 4
f7b72c6 | 2026-02-07 | test3
ea6c7ab | 2026-02-07 | тест2
f0107a4 | 2026-02-07 | тест
c075a33 | 2026-02-07 | fix: use env variables for Supabase URL and key
994c6b5 | 2026-02-07 | fix: use direct fetch for Edge Function
5eb3bb8 | 2026-02-07 | fix: use admin.getUser(jwt) for authentication
f08d028 | 2026-02-07 | test log supabase
5f959d7 | 2026-02-07 | fix: remove manual Authorization header
aca3948 | 2026-02-07 | fix: use ANON_KEY client for user authentication
9c9a7ff | 2026-02-07 | fix: add Authorization header to Edge Function call
ae79c39 | 2026-02-07 | chore: code formatting
9e908c1 | 2026-02-07 | use Supabase Edge Function for user creation
412adef | 2026-02-07 | ремонт создания пользователя 1  
be20622 | 2026-02-07 | мелкі исправлення
de4ae05 | 2026-02-07 | Add debitorka
```

---

## Известные проблемы

### Решённые
1. ✅ **401 при создании пользователей через Edge Function**
   - Решено: переход на signUp с восстановлением сессии
   - Коммит: 9011d65

2. ✅ **Project ID mismatch в supabase/config.toml**
   - Решено: исправлен на qtphickigswerhvintvh
   - Коммит: c075a33

3. ✅ **Railway не деплоит автоматически**
   - Решено: empty commit триггер
   - Коммит: 0903e09

### Текущие
Нет критических проблем.

### Потенциальные
1. ⚠️ **Rate limits при массовом создании пользователей**
   - Временно: задержка между запросами
   - Долгосрочно: batch creation через Edge Function

2. ⚠️ **Edge Function create-user не используется**
   - Состояние: есть код, но не активен
   - Решение: удалить или переработать

---

## Migration Notes

### v0.0.0 → Текущая версия

**Database:**
- Множество SQL миграций (см. APPLY_*.sql файлы)
- Основные таблицы созданы и настроены
- RLS политики применены
- Triggers и functions реализованы

**Frontend:**
- Переход с чистого Vite template на полноценное приложение
- Интеграция shadcn-ui
- Настройка TanStack Query
- Создание всех основных страниц и компонентов

**Backend:**
- Supabase проект настроен (qtphickigswerhvintvh)
- Auth настроен с JWT
- Edge Functions созданы (частично используются)

---

## Планы на будущее

### Краткосрочные (1-2 недели)
- [ ] Проверить создание пользователей на production
- [ ] Добавить batch user creation
- [ ] Оптимизация запросов к БД
- [ ] Code refactoring больших компонентов

### Среднесрочные (1-2 месяца)
- [ ] Добавить Unit тесты
- [ ] Добавить E2E тесты
- [ ] Улучшить error handling
- [ ] Добавить логирование и мониторинг
- [ ] Dark theme support
- [ ] Экспорт данных в Excel/PDF

### Долгосрочные (3+ месяца)
- [ ] Мобильное приложение (React Native)
- [ ] API для интеграций
- [ ] Расширенная аналитика
- [ ] Machine learning для прогнозов
- [ ] Multi-tenant support

---

**Последнее обновление:** 8 февраля 2026  
**Всего коммитов:** 100+  
**Contributors:** Основной разработчик + AI ассистент
