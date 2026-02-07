# API Routes в Development режиме

## Проблема

API routes (например `/api/create-user`) не работают в обычном Vite dev сервере (`npm run dev`).

## Решение 1: Vercel CLI (Рекомендуется)

Vercel CLI запускает локальный сервер, который эмулирует production окружение:

```powershell
# Установить Vercel CLI глобально
npm install -g vercel

# Запустить dev сервер с поддержкой API routes
vercel dev
```

Vercel dev автоматически:

- Запускает Vite на порту 8080
- Обрабатывает API routes из папки `/api`
- Загружает environment variables

## Решение 2: Production API URL

Если нужно быстро протестировать, можно использовать production API:

1. Создайте файл `.env.local`:

```env
VITE_API_URL=https://your-app.vercel.app
```

2. Перезапустите dev сервер:

```powershell
npm run dev
```

## Решение 3: Отключить функции, требующие API

Временно закомментируйте код создания пользователей и работайте с остальным функционалом.

## Проверка

После запуска vercel dev или настройки VITE_API_URL:

1. Откройте http://localhost:8080
2. Перейдите в "Користувачі"
3. Попробуйте создать пользователя
4. В консоли не должно быть ошибки 404 для `/api/create-user`

## Troubleshooting

**"Cannot find module '@vercel/node'"**

```powershell
npm install @vercel/node
```

**"SUPABASE_SERVICE_ROLE_KEY not found"**

- Добавьте переменные в `.env` или настройте через Vercel dashboard
- Service Role Key находится в Supabase Project Settings → API
