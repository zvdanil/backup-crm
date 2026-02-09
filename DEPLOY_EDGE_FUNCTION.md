# Деплой Supabase Edge Function для создания пользователей

## Что изменилось

Система теперь использует **Supabase Edge Function** вместо Vercel API Routes.
**Преимущества:**

- ✅ Работает на любой платформе (Railway, Vercel, Netlify, etc)
- ✅ Не зависит от хостинга frontend
- ✅ Универсальное решение

## Деплой Edge Function

### Шаг 1: Установить Supabase CLI (если еще не установлен)

```powershell
npm install -g supabase
```

### Шаг 2: Залогиниться в Supabase

```powershell
supabase login
```

Откроется браузер для авторизации.

### Шаг 3: Связать проект с Supabase

```powershell
# В папке проекта
cd c:\Users\Dasha\Desktop\backup-crm

# Связать с вашим Supabase проектом
supabase link --project-ref your-project-ref
```

**Где найти project-ref:**

- Зайдите в Supabase Dashboard
- URL выглядит как: `https://supabase.com/dashboard/project/[YOUR-PROJECT-REF]`
- Или в Settings → General → Reference ID

### Шаг 4: Задеплоить Edge Function

```powershell
supabase functions deploy create-user
```

### Шаг 5: Проверить что функция работает

Зайдите в Supabase Dashboard:

- Edge Functions → create-user
- Должна быть зеленая галочка "Deployed"

## Проверка работы

1. Задеплойте изменения на Railway:

   ```powershell
   git add .
   git commit -m "feat: use Supabase Edge Function for user creation"
   git push
   ```

2. После деплоя откройте сайт
3. Попробуйте создать пользователя через интерфейс
4. Должно работать без ошибок!

## Troubleshooting

### Ошибка "Function not found"

Edge Function не задеплоена. Повторите:

```powershell
supabase functions deploy create-user
```

### Ошибка "Missing SUPABASE_SERVICE_ROLE_KEY"

Edge Function автоматически получает эту переменную из Supabase.
Проверьте что вы залогинены: `supabase login`

### Ошибка CORS

CORS настроен в Edge Function, должно работать.
Если проблемы - проверьте что используете последнюю версию `@supabase/supabase-js` (≥2.39.0)

## После деплоя

Папку `/api` можно удалить - она больше не нужна:

```powershell
rm -r api
```

Теперь создание пользователей работает универсально на любой платформе! 🎉
