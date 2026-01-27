# Глубокий анализ проблемы CORS

## Проблема

Ошибка: `Response to preflight request doesn't pass access control check: It does not have HTTP ok status`

Это означает, что браузер отправляет OPTIONS запрос (preflight), но получает неправильный ответ.

## Диагностика: Что проверить

### 1. Проверьте, какой код используется на фронтенде

**Откройте консоль браузера (F12) и проверьте:**

1. Откройте вкладку **Network** (Сеть)
2. Попробуйте создать пользователя
3. Найдите запрос к `create-user`
4. Проверьте:
   - Какой метод используется? (должен быть POST, но сначала должен быть OPTIONS)
   - Есть ли запрос OPTIONS? Если нет - проблема в другом месте
   - Какой статус у OPTIONS запроса? (должен быть 200 или 204)

### 2. Проверьте код функции в Dashboard

**В Supabase Dashboard:**

1. Откройте Edge Functions → `create-user`
2. Проверьте код функции - должен быть такой блок:
   ```typescript
   if (req.method === 'OPTIONS') {
     return new Response(null, { 
       status: 204,  // ← ВАЖНО: должен быть 204 или 200
       headers: corsHeaders 
     })
   }
   ```

3. **Если этого блока нет или он неправильный:**
   - Скопируйте ВЕСЬ код из файла `supabase/functions/create-user/index.ts`
   - Вставьте в редактор Dashboard
   - Нажмите **Deploy**

### 3. Проверьте настройки CORS в Supabase Dashboard

**Возможно, нужно настроить CORS на уровне проекта:**

1. В Supabase Dashboard перейдите в **Settings** → **API**
2. Найдите раздел **CORS** или **Allowed Origins**
3. Убедитесь, что добавлен ваш домен:
   - `https://iris-hazel-six.vercel.app`
   - Или используйте `*` для всех доменов

### 4. Проверьте, используется ли правильный метод вызова

**В коде `src/hooks/useUserProfiles.ts` должно быть:**

```typescript
const { data: result, error: functionError } = await supabase.functions.invoke('create-user', {
  body: { ... }
});
```

**НЕ должно быть:**
```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, { ... });
```

### 5. Проверьте логи функции в Dashboard

1. В Dashboard → Edge Functions → `create-user` → **Logs**
2. Попробуйте создать пользователя
3. Проверьте логи:
   - Есть ли запросы OPTIONS?
   - Какой статус возвращается?
   - Есть ли ошибки?

### 6. Проверьте переменные окружения

1. Edge Functions → Settings → Secrets
2. Убедитесь, что есть секрет `SUPABASE_SERVICE_ROLE_KEY`
3. Проверьте, что значение правильное (Service Role Key из Settings → API)

## Возможные причины и решения

### Причина 1: Функция не обновлена в Dashboard

**Решение:**
1. Откройте функцию в Dashboard
2. Скопируйте ВЕСЬ код из `supabase/functions/create-user/index.ts`
3. Вставьте в редактор (замените весь старый код)
4. Нажмите **Deploy**

### Причина 2: Код на фронтенде не обновлен

**Решение:**
1. Проверьте, что в `src/hooks/useUserProfiles.ts` используется `supabase.functions.invoke()`
2. Если используется `fetch()` - код не обновлен
3. Убедитесь, что изменения задеплоены на Vercel

### Причина 3: Supabase Edge Functions требуют специальных настроек CORS

**Решение:**
Попробуйте добавить в начало функции:
```typescript
// В самом начале функции, перед serve()
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  // ... остальной код
});
```

### Причина 4: Проблема с версией Deno или библиотек

**Решение:**
Проверьте версии в функции - возможно, нужно обновить импорты.

## Пошаговая проверка

### Шаг 1: Проверьте код функции в Dashboard

1. Откройте: https://app.supabase.com/project/qtphickigswerhvintvh/functions/create-user
2. Скопируйте весь код функции
3. Сравните с кодом из `supabase/functions/create-user/index.ts`
4. Если отличается - обновите и задеплойте

### Шаг 2: Проверьте код на фронтенде

1. Откройте файл `src/hooks/useUserProfiles.ts`
2. Найдите функцию `useCreateUser`
3. Убедитесь, что используется `supabase.functions.invoke()`, а не `fetch()`

### Шаг 3: Проверьте в браузере

1. Откройте DevTools (F12)
2. Вкладка Network
3. Попробуйте создать пользователя
4. Найдите запрос к `create-user`
5. Проверьте:
   - Есть ли OPTIONS запрос?
   - Какой статус у OPTIONS?
   - Есть ли ошибки в консоли?

### Шаг 4: Проверьте логи функции

1. В Dashboard → Edge Functions → `create-user` → Logs
2. Попробуйте создать пользователя
3. Проверьте логи на наличие ошибок

## Альтернативное решение: Использовать RPC функцию вместо Edge Function

Если Edge Function продолжает вызывать проблемы, можно создать PostgreSQL функцию и вызывать её через RPC. Это обойдет все проблемы с CORS.

## Что нужно сделать прямо сейчас

1. **Проверьте код функции в Dashboard** - убедитесь, что он совпадает с `supabase/functions/create-user/index.ts`
2. **Проверьте, что используется `supabase.functions.invoke()`** в `src/hooks/useUserProfiles.ts`
3. **Проверьте логи функции** в Dashboard после попытки создания пользователя
4. **Пришлите скриншоты или логи**, если проблема сохраняется
