# Настройка Edge Function для создания пользователей

## Проблема

Создание пользователей через админ-панель использует `signUp()`, что подпадает под rate limits Supabase (2 email/час на бесплатном плане).

## Решение

Используем Supabase Edge Function с Admin API, который обходит rate limits.

## Шаги развертывания

### 1. Установите Supabase CLI (если еще не установлен)

```bash
npm install -g supabase
```

### 2. Войдите в Supabase

```bash
supabase login
```

### 3. Свяжите проект

```bash
supabase link --project-ref ваш-project-ref
```

Project ref можно найти в URL вашего проекта Supabase:
`https://app.supabase.com/project/ваш-project-ref`

### 4. Разверните функцию

```bash
supabase functions deploy create-user
```

### 5. Настройте переменные окружения

В Supabase Dashboard:
1. Перейдите в **Edge Functions** → **Settings**
2. Добавьте переменную окружения:
   - **Name:** `SUPABASE_SERVICE_ROLE_KEY`
   - **Value:** Ваш Service Role Key (можно найти в Settings → API)

Или через CLI:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=ваш-service-role-key
```

## Альтернативное решение (без Edge Function)

Если не хотите настраивать Edge Function, можно:

1. **Увеличить задержку между запросами** - добавить задержку перед созданием пользователя
2. **Использовать разные email для тестирования**
3. **Подождать час** между созданием пользователей (чтобы не превысить лимит 2 email/час)

## Проверка работы

После развертывания функции попробуйте создать пользователя через админ-панель. Если функция не развернута, будет использоваться старый метод (`signUp()`), который подпадает под rate limits.
