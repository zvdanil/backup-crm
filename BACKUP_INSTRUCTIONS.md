# Инструкция по созданию бэкапа базы данных

## Способ 1: Через Supabase Dashboard (Рекомендуется)

Это самый простой и надежный способ:

1. Откройте [Supabase Dashboard](https://app.supabase.com)
2. Выберите ваш проект (Reference ID: `qtphickigswerhvintvh`)
3. Перейдите в **Settings** → **Database**
4. В разделе **Backups** нажмите **"Create backup"** или используйте существующие автоматические бэкапы
5. Бэкап будет создан и доступен для скачивания

## Способ 2: Через Supabase CLI (Требует пароль БД)

### Шаг 1: Получите пароль базы данных

1. Откройте Supabase Dashboard
2. Перейдите в **Settings** → **Database**
3. В разделе **Connection string** найдите пароль или сбросьте его, если забыли
4. Скопируйте пароль

### Шаг 2: Создайте бэкап

**Вариант А: Использование скрипта**

```powershell
# Запустите скрипт с паролем
.\create_backup.ps1 -DatabasePassword "ваш_пароль_бд"
```

**Вариант Б: Ручная команда**

```powershell
# Установите пароль как переменную окружения
$env:PGPASSWORD = "ваш_пароль_бд"

# Создайте бэкап
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dbUrl = "postgresql://postgres.qtphickigswerhvintvh:ваш_пароль_бд@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

npx supabase db dump --db-url $dbUrl --file "backup_$timestamp.sql"
```

**Примечание:** Команда `supabase db dump` требует Docker Desktop. Если Docker не установлен, используйте Способ 1.

## Способ 3: Через pg_dump напрямую (Требует установленный PostgreSQL)

Если у вас установлен PostgreSQL с утилитами:

```powershell
# Установите пароль
$env:PGPASSWORD = "ваш_пароль_бд"

# Создайте бэкап
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 6543 -U postgres.qtphickigswerhvintvh -d postgres -f "backup_$timestamp.sql"
```

## Способ 4: Включить автоматические бэкапы (PITR)

Для постоянной защиты данных рекомендуется включить Point-in-Time Recovery (PITR):

1. Откройте Supabase Dashboard
2. Перейдите в **Settings** → **Database**
3. В разделе **Backups** включите **Point-in-Time Recovery**
4. Это создаст автоматические бэкапы каждые несколько минут

## Рекомендации

- ✅ **Делайте бэкапы регулярно** (минимум раз в день для продакшена)
- ✅ **Проверяйте бэкапы** - периодически восстанавливайте их на тестовой БД
- ✅ **Храните бэкапы в безопасном месте** (не только локально)
- ✅ **Включите PITR** для критически важных данных

## Восстановление из бэкапа

Если нужно восстановить данные:

1. Через Dashboard: **Settings** → **Database** → **Backups** → выберите бэкап → **Restore**
2. Через CLI: `supabase db restore --backup-id <backup-id>`

## Текущий статус проекта

- **Reference ID:** `qtphickigswerhvintvh`
- **Region:** West EU (Ireland)
- **PITR:** Не включен (рекомендуется включить)
- **Автоматические бэкапы:** Зависит от плана Supabase
