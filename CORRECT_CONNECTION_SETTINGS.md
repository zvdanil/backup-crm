# Правильные настройки подключения для вашего проекта

## ✅ Настройки из вашего проекта:

Согласно файлу `supabase/.temp/pooler-url`, правильные настройки:

### Connection Pooling:

**Настройки:**
- **Host:** `aws-1-eu-west-1.pooler.supabase.com` ⚠️ **Обратите внимание: `aws-1`, а не `aws-0`!**
- **Port:** `5432`
- **Database:** `postgres`
- **Username:** `postgres.qtphickigswerhvintvh` (с префиксом `postgres.`)
- **Password:** ваш пароль базы данных

**Connection String:**
```
postgresql://postgres.qtphickigswerhvintvh:ВАШ_ПАРОЛЬ@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

## 🔧 Настройки в DBeaver:

1. **Host:** `aws-1-eu-west-1.pooler.supabase.com` (не `aws-0`!)
2. **Port:** `5432`
3. **Database:** `postgres`
4. **Username:** `postgres.qtphickigswerhvintvh`
5. **Password:** ваш пароль БД

## ⚠️ Частые ошибки:

1. **Неправильный хост:** Используется `aws-0` вместо `aws-1`
2. **Неправильный порт:** Используется `6543` вместо `5432`
3. **Неправильный username:** Должен быть `postgres.qtphickigswerhvintvh` (с префиксом)

## 🔍 Где взять актуальные настройки:

1. Откройте: https://app.supabase.com/project/qtphickigswerhvintvh/settings/database
2. Найдите раздел **"Connection string"**
3. Выберите вкладку **"Connection pooling"**
4. Скопируйте connection string оттуда - там будут актуальные настройки

## 💡 Если все еще не работает:

Попробуйте **Direct Connection**:

- **Host:** `db.qtphickigswerhvintvh.supabase.co`
- **Port:** `5432`
- **Database:** `postgres`
- **Username:** `postgres` (БЕЗ префикса проекта!)
- **Password:** ваш пароль
