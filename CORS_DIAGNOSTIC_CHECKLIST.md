# CORS Diagnostic Checklist

## Проблема
Edge Function `create-user` возвращает CORS ошибку при вызове из фронтенда:
```
Access to fetch at 'https://qtphickigswerhvintvh.supabase.co/functions/v1/create-user' 
from origin 'https://iris-hazel-six.vercel.app' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
It does not have HTTP ok status.
```

## Что проверить:

### 1. Проверка развернутой Edge Function
- Откройте Supabase Dashboard → Edge Functions → `create-user`
- Убедитесь, что код функции соответствует локальному коду
- Проверьте, что функция развернута (deployed)

### 2. Проверка переменных окружения
- Откройте Edge Function → Settings → Secrets
- Убедитесь, что установлены:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### 3. Проверка через curl (тест OPTIONS запроса)
Выполните в терминале:
```bash
curl -X OPTIONS https://qtphickigswerhvintvh.supabase.co/functions/v1/create-user \
  -H "Origin: https://iris-hazel-six.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -v
```

Ожидаемый ответ:
- Status: `204 No Content`
- Headers должны содержать:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`

### 4. Проверка через Network Tab в браузере
1. Откройте DevTools (F12) → Network
2. Попробуйте создать пользователя
3. Найдите запрос `create-user`
4. Проверьте:
   - Есть ли OPTIONS запрос перед POST?
   - Какой статус у OPTIONS запроса?
   - Какие заголовки в ответе OPTIONS?

### 5. Альтернативное решение
Если CORS проблема не решается, можно:
1. Использовать прямой `fetch` вместо `supabase.functions.invoke()`
2. Добавить прокси через Vercel Edge Function
3. Использовать Supabase REST API напрямую (но это не обойдет rate limits)

### 6. Проверка логов Edge Function
- Откройте Supabase Dashboard → Edge Functions → `create-user` → Logs
- Проверьте, приходят ли запросы
- Проверьте, есть ли ошибки в логах

## Текущее состояние кода

### Edge Function (`supabase/functions/create-user/index.ts`)
- ✅ Обрабатывает OPTIONS запросы
- ✅ Возвращает статус 204 для OPTIONS
- ✅ Устанавливает CORS заголовки

### Frontend (`src/hooks/useUserProfiles.ts`)
- ✅ Использует `supabase.functions.invoke()` (должен автоматически обрабатывать CORS)
- ✅ Обрабатывает ошибки CORS
- ✅ Пытается найти созданного пользователя даже при ошибке CORS

## Следующие шаги
1. Проверить развернутую версию Edge Function
2. Проверить OPTIONS запрос через curl
3. Проверить Network Tab в браузере
4. Если проблема сохраняется - рассмотреть альтернативные решения
