# Исправления для авторизации

## Что исправлено

### 1. Users.tsx - queryClient не определен

**Проблема:** `ReferenceError: queryClient is not defined`  
**Решение:** Добавлена строка `const queryClient = useQueryClient();` в компонент

### 2. API Routes в dev режиме (404 ошибка)

**Проблема:** `/api/create-user` возвращает 404 в dev режиме  
**Причина:** Vite dev сервер не обрабатывает API routes

**Решений 3:**

#### Вариант A: Vercel CLI (РЕКОМЕНДУЕТСЯ)

```powershell
# Установить Vercel CLI
npm install -g vercel

# Запустить с поддержкой API
vercel dev
```

Откроется на http://localhost:3000

#### Вариант B: Production API

Создайте `.env.local`:

```env
VITE_API_URL=https://your-production-app.vercel.app
```

Затем:

```powershell
npm run dev
```

#### Вариант C: Работа без создания пользователей

Временно не используйте функцию создания пользователей в dev режиме.

### 3. Отладочные логи убраны

Удалены многократные console.log из EnhancedAttendanceCell.tsx

## Что делать сейчас

1. **Перезапустите dev сервер**

   ```powershell
   # Остановите текущий (Ctrl+C)
   npm run dev
   # Или используйте vercel dev
   ```

2. **Проверьте Users.tsx**
   - Ошибка `queryClient is not defined` должна исчезнуть

3. **Для создания пользователей**
   - Используйте `vercel dev` вместо `npm run dev`
   - Или настройте VITE_API_URL на production

4. **Проверьте консоль**
   - Не должно быть спама от EnhancedAttendanceCell
   - Warning про Dialog Description - можно игнорировать

## Environment Variables для API

Для работы API нужны:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Service Role Key найдете в:
Supabase Dashboard → Project Settings → API → service_role key (secret)

## Если все еще не работает

1. Проверьте .env файлы
2. Убедитесь, что переменные окружения загружены
3. Проверьте консоль браузера - должна быть только одна ошибка про API (если не используете vercel dev)
4. Все остальное должно работать нормально

## Дополнительно

- [DEV_SETUP_API.md](DEV_SETUP_API.md) - подробная инструкция по настройке API
- Создание пользователей работает только в production или с vercel dev
- Остальной функционал работает с обычным `npm run dev`
