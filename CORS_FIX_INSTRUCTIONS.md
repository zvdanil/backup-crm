# Инструкция по исправлению CORS ошибки

## Проблема

Ошибка: `Response to preflight request doesn't pass access control check: It does not have HTTP ok status`

Это означает, что preflight запрос (OPTIONS) не обрабатывается правильно.

## Решение

### Шаг 1: Обновите код функции в Dashboard

1. Откройте Supabase Dashboard → Edge Functions → `create-user`

2. **ВАЖНО:** Замените ВЕСЬ код функции на обновленный код из файла:
   - `supabase/functions/create-user/index.ts`

3. Убедитесь, что в коде есть:
   ```typescript
   if (req.method === 'OPTIONS') {
     return new Response(null, { 
       status: 204,  // ← Должен быть 204, не 200!
       headers: {
         ...corsHeaders,
         'Content-Length': '0',
       }
     })
   }
   ```

4. Нажмите **"Deploy"** или **"Save"**

### Шаг 2: Проверьте настройки CORS в Dashboard

1. В разделе Edge Functions найдите функцию `create-user`
2. Откройте настройки функции
3. Проверьте, что нет дополнительных ограничений CORS
4. Если есть настройки "Allowed Origins", убедитесь, что добавлен ваш домен:
   - `https://iris-hazel-six.vercel.app`
   - Или используйте `*` для всех доменов

### Шаг 3: Проверьте переменные окружения

Убедитесь, что секрет `SUPABASE_SERVICE_ROLE_KEY` добавлен:
1. Edge Functions → Settings → Secrets
2. Должен быть секрет с именем `SUPABASE_SERVICE_ROLE_KEY`

### Шаг 4: Проверьте логи функции

1. Откройте функцию `create-user`
2. Перейдите на вкладку **"Logs"**
3. Попробуйте создать пользователя
4. Проверьте логи на наличие ошибок

## Альтернативное решение: Использовать Supabase Client напрямую

Если CORS все еще не работает, можно использовать Supabase Client для вызова функции:

```typescript
const { data, error } = await supabase.functions.invoke('create-user', {
  body: {
    email: userData.email,
    password: userData.password,
    parentName: userData.parentName,
    childName: userData.childName,
    role: userData.role,
    isActive: userData.isActive,
  }
})
```

Это обходит проблемы с CORS, так как Supabase Client автоматически обрабатывает авторизацию и CORS.

## Проверка

После обновления:
1. Очистите кэш браузера (Ctrl+Shift+Delete)
2. Обновите страницу (F5)
3. Попробуйте создать пользователя снова

Если ошибка сохраняется, проверьте:
- Обновлена ли функция в Dashboard
- Правильный ли статус для OPTIONS (должен быть 204)
- Добавлены ли все CORS заголовки
