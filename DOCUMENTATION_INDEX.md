# 📚 Документация backup-crm

## Навигация по документам

### 🚀 Быстрый старт
1. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Краткая справка (начните здесь!)
   - Ключевая информация
   - Основные команды
   - Структура проекта
   - Ссылки на ресурсы

### 📖 Основная документация

#### Обзор проекта
2. **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** - Полный контекст проекта ⭐
   - Общая информация
   - Технологический стек
   - Архитектура
   - Ключевые компоненты
   - Конфигурация
   - Последние изменения
   - Проблемы и решения

3. **[ARCHITECTURE.md](ARCHITECTURE.md)** - Техническая архитектура
   - Архитектурные решения
   - Паттерны кода
   - Supabase интеграция
   - Authentication flow
   - Performance optimizations
   - Best practices

4. **[CHANGELOG.md](CHANGELOG.md)** - История изменений
   - Последние обновления
   - Решённые проблемы
   - Планы на будущее

5. **[README.md](README.md)** - Базовая информация
   - Welcome страница
   - Как редактировать код
   - Используемые технологии

#### База данных

6. **[database_schema.md](database_schema.md)** - Схема базы данных
   - Структура таблиц
   - Связи между таблицами
   - Enums и типы

7. **database_schema.sql** - SQL схема
   - CREATE TABLE statements
   - Constraints
   - Indexes

#### Миграции и скрипты

**Применение миграций:**
- APPLY_MIGRATIONS.sql - Основные миграции
- APPLY_ADVANCE_MIGRATIONS_*.sql - Миграции advance платежей
- APPLY_AUTO_CHARGE_SIMPLIFIED.sql - Упрощённый auto-charge
- APPLY_DISTRIBUTE_FIX_*.sql - Исправления distribute функции
- APPLY_PER_WORKING_DAY_MIGRATIONS.sql - Миграции per working day
- APPLY_REBUILD_FUNCTION.sql - Пересборка функций

**Проверка данных:**
- CHECK_*.sql - Множество скриптов для проверки данных

**Исправления:**
- FIX_*.sql - Исправления различных проблем

**Очистка:**
- CLEANUP_*.sql - Скрипты очистки данных

### 🔐 Аутентификация и авторизация

8. **[AUTH_FIXES_README.md](AUTH_FIXES_README.md)** - Исправления auth
   - Проблемы с аутентификацией
   - Решения

9. **[FIX_USER_REGISTRATION_ISSUES.md](FIX_USER_REGISTRATION_ISSUES.md)** - Проблемы регистрации
   - Анализ проблем
   - Пошаговые решения

10. **[AUTH_ISSUES_ANALYSIS.md](AUTH_ISSUES_ANALYSIS.md)** - Анализ auth проблем

### 🚢 Deployment

11. **[DEPLOY_EDGE_FUNCTION.md](DEPLOY_EDGE_FUNCTION.md)** - Деплой Edge Functions
    - Пошаговая инструкция
    - Troubleshooting

12. **[EDGE_FUNCTION_DASHBOARD_GUIDE.md](EDGE_FUNCTION_DASHBOARD_GUIDE.md)** - Dashboard guide
13. **[EDGE_FUNCTION_SETUP.md](EDGE_FUNCTION_SETUP.md)** - Setup guide

### 🐛 CORS и отладка

14. **[CORS_DEEP_ANALYSIS.md](CORS_DEEP_ANALYSIS.md)** - Глубокий анализ CORS
15. **[CORS_DIAGNOSTIC_CHECKLIST.md](CORS_DIAGNOSTIC_CHECKLIST.md)** - Checklist
16. **[CORS_FIX_INSTRUCTIONS.md](CORS_FIX_INSTRUCTIONS.md)** - Инструкции по исправлению

### 📊 Dashboard

17. **[DASHBOARD_DEBUG_ANALYSIS.md](DASHBOARD_DEBUG_ANALYSIS.md)** - Отладка dashboard
18. **[DASHBOARD_SYNC_ISSUES_ANALYSIS.md](DASHBOARD_SYNC_ISSUES_ANALYSIS.md)** - Проблемы синхронизации
19. **[DASHBOARD_UPDATE_ALGORITHM.md](DASHBOARD_UPDATE_ALGORITHM.md)** - Алгоритм обновления
20. **[DASHBOARD_UPDATE_FIX.md](DASHBOARD_UPDATE_FIX.md)** - Исправления обновления

### 💰 Финансовая логика

21. **[STAFF_FINANCIAL_CALENDAR_ROWS_LOGIC.md](STAFF_FINANCIAL_CALENDAR_ROWS_LOGIC.md)** - Логика финансового календаря
22. **[EXPLAIN_RECALCULATE_FUNCTION.md](EXPLAIN_RECALCULATE_FUNCTION.md)** - Функция пересчёта
23. **[DISTRIBUTE_FUNCTION_EXECUTION_FLOW.md](DISTRIBUTE_FUNCTION_EXECUTION_FLOW.md)** - Поток distribute функции
24. **[ANALYZE_AUTO_CHARGE_LOGIC.md](ANALYZE_AUTO_CHARGE_LOGIC.md)** - Анализ auto-charge логики

### 🔧 API и Development

25. **[DEV_SETUP_API.md](DEV_SETUP_API.md)** - Setup API для разработки
26. **[VERCEL_API_SETUP.md](VERCEL_API_SETUP.md)** - Настройка Vercel API

### 💾 Backup

27. **[BACKUP_CREATED_NEXT_STEPS.md](BACKUP_CREATED_NEXT_STEPS.md)** - Следующие шаги после backup
28. **[BACKUP_INSTRUCTIONS.md](BACKUP_INSTRUCTIONS.md)** - Инструкции backup
29. **[BACKUP_SOLUTIONS.md](BACKUP_SOLUTIONS.md)** - Решения backup
30. **[BACKUP_FREE_PLAN.md](BACKUP_FREE_PLAN.md)** - Backup для free plan
31. **[КАК_ЗАПУСТИТЬ_БЭКАП.md](КАК_ЗАПУСТИТЬ_БЭКАП.md)** - Как запустить backup (UA)
32. **[QUICK_BACKUP.md](QUICK_BACKUP.md)** - Быстрый backup

### 🔌 Подключение к БД

33. **[SUPABASE_CONNECTION_GUIDE.md](SUPABASE_CONNECTION_GUIDE.md)** - Гайд подключения Supabase
34. **[CORRECT_CONNECTION_SETTINGS.md](CORRECT_CONNECTION_SETTINGS.md)** - Правильные настройки
35. **[DBEAVER_CONNECTION_FIX.md](DBEAVER_CONNECTION_FIX.md)** - Исправление подключения DBeaver
36. **[DBEAVER_STEP_BY_STEP.md](DBEAVER_STEP_BY_STEP.md)** - Пошаговый DBeaver
37. **[NEXT_STEPS_AFTER_CONNECTION.md](NEXT_STEPS_AFTER_CONNECTION.md)** - Следующие шаги

### 📋 Cleanup и обслуживание

38. **[CLEANUP_README.md](CLEANUP_README.md)** - Руководство по очистке
39. **[CLEANUP_INACTIVE_ENROLLMENTS.md](CLEANUP_INACTIVE_ENROLLMENTS.md)** - Очистка enrollments
40. **[STAFF_JOURNAL_CLEANUP_GUIDE.md](STAFF_JOURNAL_CLEANUP_GUIDE.md)** - Очистка staff journal
41. **[ANALYSIS_INACTIVE_ENROLLMENTS.md](ANALYSIS_INACTIVE_ENROLLMENTS.md)** - Анализ enrollments

### 🔍 Анализ и отчёты

42. **[REPORT_RESULTS_ANALYSIS.md](REPORT_RESULTS_ANALYSIS.md)** - Анализ результатов отчётов
43. **[REPORT_RESULTS_ZERO.md](REPORT_RESULTS_ZERO.md)** - Нулевые результаты
44. **[WHY_DATA_STILL_SHOWS.md](WHY_DATA_STILL_SHOWS.md)** - Почему данные всё ещё показываются
45. **[FINAL_SOLUTION_VISION.md](FINAL_SOLUTION_VISION.md)** - Финальное видение решения

### ⚙️ Исправление проблем

46. **[FIX_CUSTOM_STATUSES.md](FIX_CUSTOM_STATUSES.md)** - Исправление custom statuses
47. **[STEP_BY_STEP_FIX.md](STEP_BY_STEP_FIX.md)** - Пошаговое исправление
48. **[QUICK_FIX_REGISTRATION.md](QUICK_FIX_REGISTRATION.md)** - Быстрое исправление регистрации
49. **[SIMPLIFY_PAYMENT_LOGIC.sql](SIMPLIFY_PAYMENT_LOGIC.sql)** - Упрощение payment логики
50. **[HOW_TO_RESET_DB_PASSWORD.md](HOW_TO_RESET_DB_PASSWORD.md)** - Сброс пароля БД

### 📝 Инструкции

51. **[HOW_TO_EXECUTE_ALL_QUERIES.md](HOW_TO_EXECUTE_ALL_QUERIES.md)** - Выполнение всех запросов
52. **[HOW_TO_RUN_FULL_REPORT.md](HOW_TO_RUN_FULL_REPORT.md)** - Запуск полного отчёта
53. **[APPLY_DISTRIBUTE_FIX_V2.md](APPLY_DISTRIBUTE_FIX_V2.md)** - Применение distribute fix v2
54. **[APPLY_DISTRIBUTE_FIX_V3_INSTRUCTIONS.md](APPLY_DISTRIBUTE_FIX_V3_INSTRUCTIONS.md)** - v3 инструкции

---

## 📂 Структура документов по категориям

### 1. Onboarding (начало работы)
- QUICK_REFERENCE.md ⭐ **начните здесь**
- README.md
- PROJECT_CONTEXT.md

### 2. Архитектура и код
- ARCHITECTURE.md
- PROJECT_CONTEXT.md
- database_schema.md

### 3. История и изменения
- CHANGELOG.md
- PROJECT_CONTEXT.md (раздел 7)

### 4. Deployment и CI/CD
- DEPLOY_EDGE_FUNCTION.md
- EDGE_FUNCTION_*.md
- Railway deployment (см. PROJECT_CONTEXT.md)

### 5. Troubleshooting
- AUTH_*.md (проблемы с auth)
- CORS_*.md (проблемы с CORS)
- DASHBOARD_*.md (проблемы с dashboard)
- FIX_*.md (различные исправления)
- DBEAVER_*.md (подключение к БД)

### 6. Database
- database_schema.md
- database_schema.sql
- APPLY_*.sql (миграции)

### 7. Финансы и логика
- STAFF_FINANCIAL_CALENDAR_ROWS_LOGIC.md
- DISTRIBUTE_FUNCTION_EXECUTION_FLOW.md
- ANALYZE_AUTO_CHARGE_LOGIC.md

### 8. Backup и восстановление
- BACKUP_*.md
- create_backup*.ps1

---

## 🔍 Где искать информацию

| Вопрос | Где искать |
|--------|------------|
| **Как начать работу?** | [QUICK_REFERENCE.md](QUICK_REFERENCE.md) |
| **Как устроен проект?** | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) |
| **Как организован код?** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Что изменилось?** | [CHANGELOG.md](CHANGELOG.md) |
| **Схема базы данных?** | [database_schema.md](database_schema.md) |
| **Проблемы с auth?** | AUTH_FIXES_README.md, FIX_USER_REGISTRATION_ISSUES.md |
| **Проблемы с CORS?** | CORS_*.md |
| **Как задеплоить?** | DEPLOY_EDGE_FUNCTION.md |
| **Как сделать backup?** | BACKUP_INSTRUCTIONS.md, КАК_ЗАПУСТИТЬ_БЭКАП.md |
| **Подключение к БД?** | SUPABASE_CONNECTION_GUIDE.md |
| **Финансовая логика?** | STAFF_FINANCIAL_CALENDAR_ROWS_LOGIC.md |
| **Как очистить данные?** | CLEANUP_README.md |

---

## 📝 PowerShell скрипты

| Скрипт | Описание |
|--------|----------|
| create_backup.ps1 | Основной скрипт backup |
| create_backup_simple.ps1 | Упрощённый backup |
| create_backup_interactive.ps1 | Интерактивный backup |
| run_backup.ps1 | Запуск backup |

---

## 🗂️ SQL скрипты по типам

### Миграции (APPLY_*.sql)
Применение изменений к базе данных

### Проверки (CHECK_*.sql)
Проверка данных и состояния БД

### Исправления (FIX_*.sql)
Исправление конкретных проблем

### Очистка (CLEANUP_*.sql, cleanup_*.sql)
Удаление неиспользуемых данных

### Тесты (TEST_*.sql)
Тестирование функций БД

### Отладка (DEBUG_*.sql)
Отладка сложной логики

### Поиск (FIND_*.sql)
Поиск конкретных данных

### Проверка (VERIFY_*.sql)
Верификация результатов

---

## 🎯 Рекомендуемый порядок чтения

### Для новых разработчиков:
1. ✅ [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Краткая справка
2. ✅ [README.md](README.md) - Базовая информация
3. ✅ [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) - Полный контекст
4. ✅ [ARCHITECTURE.md](ARCHITECTURE.md) - Архитектура
5. ✅ [database_schema.md](database_schema.md) - Схема БД
6. ✅ [CHANGELOG.md](CHANGELOG.md) - Последние изменения

### Для решения проблем:
1. Определите категорию (auth, CORS, dashboard, etc.)
2. Найдите соответствующие [категория]_*.md файлы
3. Проверьте CHANGELOG.md на похожие проблемы
4. Смотрите PROJECT_CONTEXT.md раздел "Проблемы и решения"

### Для работы с БД:
1. database_schema.md - понять структуру
2. SUPABASE_CONNECTION_GUIDE.md - подключиться
3. Соответствующие SQL скрипты - применить изменения

---

## 📞 Полезные ссылки

- **GitHub:** https://github.com/zvdanil/backup-crm
- **Supabase Dashboard:** https://supabase.com/dashboard/project/qtphickigswerhvintvh
- **Документация Supabase:** https://supabase.com/docs
- **Документация shadcn/ui:** https://ui.shadcn.com
- **Документация TanStack Query:** https://tanstack.com/query

---

## 🆕 Последние добавленные документы

1. **PROJECT_CONTEXT.md** - Полный контекст проекта (8 фев 2026)
2. **QUICK_REFERENCE.md** - Быстрая справка (8 фев 2026)
3. **ARCHITECTURE.md** - Техническая архитектура (8 фев 2026)
4. **CHANGELOG.md** - История изменений (8 фев 2026)
5. **DOCUMENTATION_INDEX.md** - Этот файл (8 фев 2026)

---

## 💡 Совет

Если вы не знаете с чего начать, откройте **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - там вся основная информация на одной странице!

Для глубокого понимания проекта читайте **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)**.

---

**Последнее обновление:** 8 февраля 2026  
**Всего документов:** 50+  
**Всего SQL скриптов:** 100+
