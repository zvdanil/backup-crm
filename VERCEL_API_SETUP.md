# Настройка Vercel API Route для создания пользователей

## Что сделано

1. ✅ Создан файл `api/create-user.ts` - Vercel Serverless Function
2. ✅ Обновлен `src/hooks/useUserProfiles.ts` - теперь использует `/api/create-user` вместо Edge Function
3. ✅ Обновлен `vercel.json` - добавлена конфигурация для API route

## Что нужно сделать в Vercel Dashboard

### 1. Добавить переменные окружения

1. Откройте Vercel Dashboard: https://vercel.com/dashboard
2. Выберите ваш проект `iris-hazel-six`
3. Перейдите в **Settings** → **Environment Variables**

### 2. Добавьте следующие переменные:

#### `SUPABASE_URL`
- **Name:** `SUPABASE_URL`
- **Value:** `https://qtphickigswerhvintvh.supabase.co`
- **Environment:** Production, Preview, Development (все)

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0cGhpY2tpZ3N3ZXJodmludHZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk5MDEyMSwiZXhwIjoyMDgzNTY2MTIxfQ.FJ6MrQ5eKur3G6uWQF3UmsImOEE4P9zfrwX-MZPOchc`
- **Environment:** Production, Preview, Development (все)

⚠️ **ВАЖНО:** Service Role Key - это секретный ключ! Не публикуйте его в коде.

### 3. Разверните изменения

После добавления переменных окружения:

1. Закоммитьте изменения:
   ```bash
   git add .
   git commit -m "Add Vercel API Route for user creation"
   git push
   ```

2. Vercel автоматически развернет изменения

3. Или вручную через Vercel Dashboard:
   - Перейдите в **Deployments**
   - Нажмите **"Redeploy"** на последнем деплое

## Как это работает

1. **Фронтенд** вызывает `/api/create-user` (тот же домен - нет CORS)
2. **API Route** использует Service Role Key для создания пользователя через Admin API
3. **Admin API** обходит rate limits (2 email/час)
4. **Профиль** создается автоматически через триггер или вручную в API Route

## Преимущества

- ✅ Нет CORS проблем (тот же домен)
- ✅ Обходит rate limits (Admin API)
- ✅ Проще, чем Edge Function
- ✅ Работает на Vercel

## Проверка

После развертывания:

1. Откройте приложение
2. Войдите как owner/admin
3. Перейдите в **Користувачі** → **Створити користувача**
4. Создайте пользователя - должно работать без ошибок CORS и rate limit
