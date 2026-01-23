# Руководство по тестированию OAuth регистрации

## Важно: Настройка Redirect URLs

Для работы OAuth регистрации необходимо настроить правильные Redirect URLs в двух местах:

### 1. В Supabase Dashboard

1. Перейдите в ваш проект Supabase
2. Откройте **Authentication** → **URL Configuration**
3. В разделе **Redirect URLs** добавьте:
   - Для локального тестирования: `http://localhost:5173` (или ваш порт)
   - Для продакшена: ваш домен (например, `https://yourdomain.com`)
   - Можно использовать wildcard: `http://localhost:5173/**`

### 2. В Google OAuth Console

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите ваш проект
3. Откройте **APIs & Services** → **Credentials**
4. Найдите ваш OAuth 2.0 Client ID
5. В разделе **Authorized redirect URIs** добавьте:
   - `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
   - Это URL Supabase, который обрабатывает OAuth callback

### 3. В Apple Developer Console (если используется)

1. Перейдите в [Apple Developer Portal](https://developer.apple.com/)
2. Откройте **Certificates, Identifiers & Profiles**
3. Найдите ваш App ID
4. В разделе **Redirect URIs** добавьте:
   - `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`

## Где тестировать?

### ✅ Локально (localhost)

**Можно тестировать**, если:
- В Supabase добавлен `http://localhost:5173` в Redirect URLs
- Приложение запущено на `http://localhost:5173`

**Как проверить:**
1. Запустите приложение: `npm run dev`
2. Откройте `http://localhost:5173`
3. Попробуйте зарегистрироваться через Google/Apple
4. После авторизации вы должны вернуться на `http://localhost:5173`

### ✅ Из локальной сети

**Можно тестировать**, если:
- В Supabase добавлен IP-адрес или домен вашего компьютера
- Например: `http://192.168.1.100:5173` или `http://your-pc-name.local:5173`

**Ограничения:**
- Google/Apple могут не разрешать IP-адреса в redirect URLs
- Лучше использовать доменное имя или ngrok

### ✅ Из интернета (рекомендуется для финальной проверки)

**Лучший вариант для проверки:**
- Используйте публичный URL (деплой или ngrok)
- Добавьте этот URL в Supabase и OAuth провайдеры

**Варианты:**
1. **Ngrok** (для тестирования):
   ```bash
   ngrok http 5173
   ```
   Получите URL типа `https://abc123.ngrok.io` и добавьте его в настройки

2. **Деплой** (Vercel, Netlify и т.д.):
   - Задеплойте приложение
   - Добавьте URL деплоя в настройки

## Как проверить текущие настройки

### Проверка в коде:
- Файл: `src/context/AuthContext.tsx`, строка 369
- Используется: `redirectTo: window.location.origin`
- Это означает, что редирект идет на текущий домен

### Проверка в Supabase:
1. Откройте Supabase Dashboard
2. **Authentication** → **URL Configuration**
3. Проверьте **Site URL** и **Redirect URLs**

### Проверка в Google Console:
1. Откройте Google Cloud Console
2. **APIs & Services** → **Credentials**
3. Проверьте **Authorized redirect URIs**

## Типичные проблемы

### Проблема: "redirect_uri_mismatch"
**Причина:** URL в запросе не совпадает с настройками в Google/Apple
**Решение:** Проверьте, что в Google Console добавлен URL Supabase callback

### Проблема: Редирект не работает локально
**Причина:** `localhost` не добавлен в Supabase Redirect URLs
**Решение:** Добавьте `http://localhost:5173` в Supabase Dashboard

### Проблема: После OAuth не возвращается на сайт
**Причина:** Неправильный `redirectTo` или не настроен в Supabase
**Решение:** Проверьте настройки Redirect URLs в Supabase

## Рекомендация

Для проверки регистрации **лучше всего тестировать из интернета**:
- Используйте ngrok для быстрого тестирования
- Или задеплойте на временный URL
- Это гарантирует, что все настройки работают правильно

Для локального тестирования убедитесь, что:
- ✅ `http://localhost:5173` добавлен в Supabase Redirect URLs
- ✅ В Google Console добавлен Supabase callback URL
- ✅ Приложение запущено на правильном порту
