# Настройка Edge Function для создания пользователей

## Проблема

Создание пользователей через админ-панель использует `signUp()`, что подпадает под rate limits Supabase (2 email/час на бесплатном плане).

## Решение

Используем Supabase Edge Function с Admin API, который обходит rate limits.

## Шаги развертывания

### Вариант 1: Через Supabase Dashboard (рекомендуется)

1. **Откройте Supabase Dashboard:**
   - Перейдите в ваш проект: `https://app.supabase.com/project/qtphickigswerhvintvh`

2. **Создайте Edge Function:**
   - Перейдите в **Edge Functions** в левом меню
   - Нажмите **"Create a new function"**
   - Имя функции: `create-user`
   - Скопируйте содержимое файла `supabase/functions/create-user/index.ts` в редактор
   - Нажмите **"Deploy"**

3. **Настройте переменные окружения:**
   - В разделе **Edge Functions** → **Settings** (или в настройках функции)
   - Добавьте секрет:
     - **Name:** `SUPABASE_SERVICE_ROLE_KEY`
     - **Value:** Ваш Service Role Key
     - Service Role Key можно найти в **Settings** → **API** → **service_role key** (секретный ключ)

### Вариант 2: Через Supabase CLI

### 1. Установите Supabase CLI (если еще не установлен)

```bash
npm install -g supabase
```

### 2. Войдите в Supabase

```bash
supabase login
```

### 3. Свяжите проект (если еще не связан)

```bash
supabase link --project-ref qtphickigswerhvintvh
```

### 4. Разверните функцию

```bash
supabase functions deploy create-user
```

### 5. Настройте переменные окружения

Через CLI:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=ваш-service-role-key
```

Или через Dashboard:
1. Перейдите в **Edge Functions** → **Settings**
2. Добавьте переменную окружения:
   - **Name:** `SUPABASE_SERVICE_ROLE_KEY`
   - **Value:** Ваш Service Role Key (можно найти в Settings → API)

## Альтернативное решение (без Edge Function)

Если не хотите настраивать Edge Function, можно:

1. **Увеличить задержку между запросами** - добавить задержку перед созданием пользователя
2. **Использовать разные email для тестирования**
3. **Подождать час** между созданием пользователей (чтобы не превысить лимит 2 email/час)

## Проверка работы

После развертывания функции попробуйте создать пользователя через админ-панель. Если функция не развернута, будет использоваться старый метод (`signUp()`), который подпадает под rate limits.
