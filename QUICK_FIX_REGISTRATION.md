# Быстрые шаги для исправления проблем с регистрацией

## 1️⃣ Применить миграцию (обязательно)

Откройте Supabase Dashboard → SQL Editor → New Query

Скопируйте и выполните содержимое файла:

```
supabase/migrations/20260207000000_fix_user_profile_creation_logic.sql
```

Нажмите **RUN** ▶️

---

## 2️⃣ Исправить проблемного пользователя (ID: 704f0301-a901-49cd-9b92-4edabe370037)

В том же SQL Editor выполните:

```sql
-- Проверяем пользователя
SELECT up.id, u.email, up.full_name, up.parent_name, up.child_name, up.role, up.is_active
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';

-- Исправляем (добавляем имя и меняем роль)
UPDATE user_profiles up
SET
  role = 'newregistration',
  is_active = false,
  full_name = COALESCE(
    (SELECT raw_user_meta_data->>'parent_name' FROM auth.users WHERE id = up.id),
    (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = up.id)
  ),
  parent_name = (SELECT raw_user_meta_data->>'parent_name' FROM auth.users WHERE id = up.id),
  child_name = (SELECT raw_user_meta_data->>'child_name' FROM auth.users WHERE id = up.id)
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';

-- Проверяем результат
SELECT up.id, u.email, up.full_name, up.parent_name, up.child_name, up.role, up.is_active
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.id = '704f0301-a901-49cd-9b92-4edabe370037';
```

---

## 3️⃣ Активировать пользователя в интерфейсе

1. Перейдите в **Користувачі** (Users)
2. Найдите пользователя (теперь с именем!)
3. Выберите роль: `parent` (для родителя) или `viewer`
4. Включите toggle (активация)
5. Сохраните

---

## 4️⃣ Проверить что owner только один

```sql
SELECT up.id, u.email, up.full_name, up.role, up.is_active
FROM user_profiles up
JOIN auth.users u ON u.id = up.id
WHERE up.role = 'owner';
```

Должен быть **только ОДИН** owner - ваш основной аккаунт.

---

## ✅ Готово!

Теперь:

- ✅ Новые пользователи будут получать роль `newregistration` (не owner)
- ✅ Имена будут сохраняться правильно
- ✅ Все новые регистрации требуют активации админом

---

## Тест: Зарегистрируйте нового пользователя

1. Откройте страницу регистрации
2. Заполните: email, пароль, ФИО родителя, ФІО дитини
3. Зарегистрируйтесь
4. Проверьте в панели "Користувачі":
   - Имя отображается ✅
   - Роль = `newregistration` ✅
   - Неактивен (требует активации) ✅

Подробности: `/FIX_USER_REGISTRATION_ISSUES.md`
