# Підключення до Railway (варіант 2 — повна міграція)

## Крок 1. Backend API

Сервер знаходиться в `server/`. Він підключається до Railway PostgreSQL і надає REST API замість Supabase.

### Локальний запуск

```bash
cd server
npm install
```

Створіть `server/.env`:
```
DATABASE_URL=postgresql://postgres:PASSWORD@ballast.proxy.rlwy.net:45101/railway
JWT_SECRET=ваш-секретний-рядок-для-jwt
PORT=3001
```

```bash
npm run dev
```

API буде на http://localhost:3001

### Маршрути

- `GET/POST /api/rest/v1/:table` — CRUD для таблиць
- `POST /api/auth/v1/login` — вхід
- `POST /api/auth/v1/signup` — реєстрація
- `GET /api/auth/v1/session` — сесія (Authorization: Bearer)
- `POST /api/rpc/:name` — RPC (create_account_transfer, get_user_profiles_with_email тощо)

## Крок 2. Frontend

Створіть `.env` (або `.env.local`) в корені проекту:

```
VITE_USE_RAILWAY=true
VITE_RAILWAY_API_URL=
```

Якщо `VITE_RAILWAY_API_URL` порожній, фронтенд використовує той самий origin (проксі в dev).

### Локальний запуск (frontend + backend)

1. Термінал 1:
   ```bash
   cd server && npm run dev
   ```

2. Термінал 2:
   ```bash
   npm run dev
   ```

Vite проксує `/api` на http://localhost:3001.

## Крок 3. Railway Deployment

### Варіант A: Два сервіси (frontend + API)

1. **API service**
   - Root: `server/`
   - Build: `npm install`
   - Start: `npm start`
   - Variables: `DATABASE_URL` (з PostgreSQL), `JWT_SECRET`, `PORT=3001`

2. **Web service**
   - Root: `.`
   - Build: `npm run build`
   - Start: `npx serve dist -s -l 3000`
   - Variables: `VITE_USE_RAILWAY=true`, `VITE_RAILWAY_API_URL=https://your-api.railway.app`
   - У `vite build` потрібно передати ці змінні (Vite замінює їх під час білду)

### Варіант B: Один сервіс (API + статика)

Можна налаштувати сервер так, щоб він віддавав збірку фронтенда з `/` і API з `/api`. Потрібно оновити `server/index.js` для `express.static("dist")`.

## Auth

- **Signup**: пароль хешується (bcrypt) і зберігається в `auth.users.raw_user_meta_data.password_hash`.
- **Login**: перевіряється хеш.
- **Session**: JWT в `Authorization: Bearer`.

Існуючі користувачі, перенесені з Supabase, не мають `password_hash` у нашій БД. Їм потрібно створити новий пароль (функцію «Скинути пароль» можна додати окремо).
