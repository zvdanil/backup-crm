# Пошаговая миграция: Supabase → PostgreSQL на Railway

Есть два варианта: **автоматический скрипт** (минимум действий) или **ручной** (pg_dump/pg_restore).

---

## Вариант Б: автоматический скрипт (рекомендуется)

Если не хотите ставить PostgreSQL в систему и вводить команды вручную:

1. **Создайте БД в Railway** — шаги 1 и 2 из раздела ниже: получить `RAILWAY_DATABASE_URL` и `SUPABASE_DATABASE_URL` (строка подключения к Supabase с подставленным паролем).
2. **Установите зависимости** (если ещё не ставили):  
   `npm install`
3. **Создайте файл `.env.migration`** в корне проекта (не коммитьте в git):
   ```
   SUPABASE_DATABASE_URL=postgresql://postgres.XXXX:ПАРОЛЬ@aws-0-XX.pooler.supabase.com:6543/postgres
   RAILWAY_DATABASE_URL=postgresql://postgres:ПАРОЛЬ@containers-us-west-XX.railway.app:6543/railway
   ```
4. **Запустите миграцию:**  
   `npm run migrate:to-railway`

Скрипт создаст схему на Railway из папки `supabase/migrations`, скопирует данные из Supabase и подготовит заглушку `auth.users`. Дальше — деплой приложения на Railway (шаг 7 ниже).

---

## Вариант А: ручная миграция (pg_dump / pg_restore)

Выполняйте шаги по порядку. Не переходите к следующему шагу, пока не завершили текущий.

---

## ШАГ 1. Создать базу PostgreSQL в Railway

1. Откройте в браузере: **https://railway.app**
2. Войдите в аккаунт (или зарегистрируйтесь).
3. На главной странице нажмите **«New Project»** (или **«Create new project»**).
4. В окне выбора шаблона выберите **«Deploy from GitHub repo»** или **«Empty Project»**.
   - Если выбрали Empty Project: откроется пустой проект.
   - Если Deploy from GitHub: позже подключите репозиторий; пока можно оставить как есть.
5. Внутри проекта нажмите **«+ New»** (или **«Add Service»**).
6. В списке сервисов выберите **«Database»** → **«PostgreSQL»**.
7. Дождитесь создания БД (иконка PostgreSQL появится в списке сервисов, статус станет «Active»).
8. Кликните по сервису **PostgreSQL**.
9. Откройте вкладку **«Variables»** (или **«Connect»**).
10. Найдите переменную **`DATABASE_URL`** (или **`POSTGRES_URL`**). Скопируйте её значение (правый клик → Copy, или кнопка Copy).
    - Формат: `postgresql://postgres:PASSWORD@HOST:PORT/railway`
11. Сохраните значение в безопасное место (например, временный файл у себя на компьютере). Оно понадобится в шагах 4 и 6.

**Проверка:** переменная скопирована и сохранена.

---

## ШАГ 2. Получить строку подключения к Supabase (для экспорта)

1. Откройте в браузере: **https://supabase.com/dashboard**
2. Войдите и выберите ваш проект (тот, что используется для текущего сайта).
3. В левом меню нажмите **«Project Settings»** (иконка шестерёнки внизу).
4. В левой колонке настроек выберите **«Database»**.
5. Прокрутите до блока **«Connection string»**.
6. Выберите вкладку **«URI»**.
7. Скопируйте строку подключения. Она выглядит так:
   ```
   postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
8. Замените в строке `[YOUR-PASSWORD]` на реальный пароль пользователя `postgres`.
   - Пароль можно посмотреть/сбросить в том же разделе **Database** → **Database password** (кнопка «Reset database password» если забыли).
9. Сохраните итоговую строку (с подставленным паролем) в безопасное место. Обозначим её как **SUPABASE_DATABASE_URL**.

**Проверка:** у вас есть строка вида `postgresql://postgres...@...supabase.com:6543/postgres` с паролем.

---

## ШАГ 3. Установить PostgreSQL клиент (если ещё не установлен)

Нужен для команд `pg_dump` и `psql` в терминале.

**Windows (через winget или установщик):**
1. Откройте PowerShell или cmd от имени администратора.
2. Выполните (если есть winget):
   ```
   winget install PostgreSQL.PostgreSQL
   ```
   Или скачайте установщик с https://www.postgresql.org/download/windows/ и установите, добавив в PATH папку `bin` (например `C:\Program Files\PostgreSQL\16\bin`).
3. Закройте и снова откройте терминал. Проверьте:
   ```
   pg_dump --version
   psql --version
   ```

**macOS:**
```bash
brew install libpq
brew link --force libpq
```
Проверка: `pg_dump --version`

**Проверка:** команды `pg_dump` и `psql` выполняются без ошибки «command not found».

---

## ШАГ 4. Экспорт схемы и данных из Supabase

1. Откройте терминал в любой папке (например, рабочий стол или домашняя папка).
2. Создайте папку для дампов (например):
   - Windows (PowerShell): `mkdir C:\supabase_migration`
   - macOS/Linux: `mkdir ~/supabase_migration`
3. Перейдите в неё:
   - Windows: `cd C:\supabase_migration`
   - macOS/Linux: `cd ~/supabase_migration`
4. Выполните экспорт **полного** дампа (схема + данные) из Supabase. Подставьте вместо `SUPABASE_DATABASE_URL` вашу строку из Шага 2 (в кавычках).

   **Windows (PowerShell):**
   ```powershell
   $env:PGPASSWORD = "ВАШ_ПАРОЛЬ_SUPABASE"
   pg_dump -h aws-0-XX.pooler.supabase.com -p 6543 -U postgres.qtphickigswerhvintvh -d postgres -F c -f supabase_full.dump
   ```
   Хост и имя пользователя возьмите из вашей SUPABASE_DATABASE_URL (после `@` и до `:6543` — хост, в начале после `postgresql://` — user).

   **Универсальный вариант (если pg_dump принимает URI):**
   ```bash
   pg_dump "SUPABASE_DATABASE_URL" -F c -f supabase_full.dump
   ```
   Замените `SUPABASE_DATABASE_URL` на полную строку (в кавычках), например:
   ```bash
   pg_dump "postgresql://postgres.XXXX:ПАРОЛЬ@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" -F c -f supabase_full.dump
   ```
5. Дождитесь окончания (может занять 1–5 минут). Ошибок быть не должно.
6. Проверьте, что файл создан:
   - Windows: `dir supabase_full.dump`
   - macOS/Linux: `ls -la supabase_full.dump`

**Если pg_dump не принимает URI:** разбейте на части:
- `-h` хост из URL (между @ и :6543)
- `-p 6543`
- `-U` пользователь (после postgresql:// и до :)
- `-d postgres`
- И перед командой: `set PGPASSWORD=ваш_пароль` (Windows cmd) или `export PGPASSWORD=ваш_пароль` (macOS/Linux).

**Проверка:** файл `supabase_full.dump` есть в папке и размер больше 0.

---

## ШАГ 5. Импорт дампа в Railway PostgreSQL

1. В том же терминале, в папке с `supabase_full.dump`, выполните восстановление в Railway.
2. Подставьте вместо `RAILWAY_DATABASE_URL` строку из Шага 1 (в кавычках).

   **Вариант с URI (восстановить только схему `public` — меньше конфликтов с Supabase-схемами):**
   ```bash
   pg_restore -d "RAILWAY_DATABASE_URL" -n public --no-owner --no-acl supabase_full.dump
   ```
   Подставьте вместо `RAILWAY_DATABASE_URL` вашу строку из Шага 1 в кавычках.

   **Если нужны все схемы из дампа** (в т.ч. не только public):
   ```bash
   pg_restore -d "RAILWAY_DATABASE_URL" --no-owner --no-acl supabase_full.dump
   ```

3. Возможны предупреждения (WARNING) о том, что какие-то объекты не удалось создать — часто это объекты из схем `auth`, `storage`, `realtime`. Их можно игнорировать, если вы используете только `public`.
4. Если появится ошибка «relation already exists» (при повторном импорте), сначала очистите БД или используйте:
   ```bash
   pg_restore -d "RAILWAY_DATABASE_URL" -n public --no-owner --no-acl --clean --if-exists supabase_full.dump
   ```
5. Проверьте, что данные есть: подключитесь к Railway и выполните запрос (подставьте свой RAILWAY_DATABASE_URL):
   ```bash
   psql "RAILWAY_DATABASE_URL" -c "SELECT COUNT(*) FROM public.students;"
   ```
   Должно вернуться число строк. Аналогично можно проверить другие таблицы: `finance_transactions`, `activities`, `staff` и т.д.

**Проверка:** в Railway в таблицах `public.*` есть данные (количество строк совпадает с Supabase по ключевым таблицам).

---

## ШАГ 6. Включить расширение uuid-ossp в Railway (если нужно)

Если в миграциях используется `uuid_generate_v4()` или расширение `uuid-ossp`:

1. Подключитесь к Railway БД:
   ```bash
   psql "RAILWAY_DATABASE_URL"
   ```
2. В консоли psql выполните:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   \q
   ```
Если ошибка «extension already exists» — ничего делать не нужно.

**Проверка:** расширение создано или уже было.

---

## ШАГ 7. Деплой приложения на Railway (тот же код, что и на Vercel)

1. В проекте Railway нажмите **«+ New»** → **«GitHub Repo»** (или **«Empty Service»**).
2. Если выбрали GitHub Repo:
   - Выберите организацию и репозиторий с вашим фронтендом.
   - Выберите ветку (например `main`).
   - Root Directory оставьте пустым, если проект в корне.
3. Railway создаст сервис и попытается собрать проект. Для Vite/React часто нужно указать команды сборки и запуска.
4. Откройте настройки сервиса (клик по сервису) → вкладка **«Settings»** (или **«Variables»**).
5. В разделе **Variables** добавьте переменные окружения (те же имена, что и на Vercel, чтобы не менять код):
   - `VITE_SUPABASE_URL` = ваш текущий Supabase URL (например `https://qtphickigswerhvintvh.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = ваш текущий anon/publishable key из Supabase
   - При необходимости: `VITE_SUPABASE_ANON_KEY` (если используется в коде)
6. В разделе **Build** укажите:
   - Build Command: `npm run build` (или `pnpm build` / `yarn build`)
   - Output Directory: `dist` (для Vite)
   - Install Command: `npm install` (или `pnpm install` / `yarn install`)
7. В разделе **Deploy** укажите:
   - Start Command: для статики Vite обычно нужен веб-сервер, например: `npx serve dist -s` или `npx vite preview --host` (для preview). Либо выберите в Railway шаблон **Static Site** и укажите папку `dist`.
8. Сохраните настройки и дождитесь деплоя (Redeploy при необходимости).

**Важно:** на этом шаге приложение на Railway по-прежнему обращается к **Supabase** (те же `VITE_SUPABASE_URL` и ключ). То есть оба сайта (Vercel и Railway) работают с одной и той же базой Supabase — так ничего не ломается. База на Railway пока является копией для миграции и может использоваться для отчётов, бэкапов или будущего переключения (см. ниже).

**Проверка:** сайт на Railway открывается по ссылке из Railway (например `xxx.up.railway.app`) и данные отображаются (те же, что на Vercel).

---

## ШАГ 8. (Опционально) Дальнейшее переключение Railway на свою БД

Сейчас фронтенд обращается только к API Supabase (по URL и ключу). Чтобы приложение на Railway использовало **именно Railway PostgreSQL**, нужен один из вариантов:

- **Вариант A.** Развернуть на Railway стек, совместимый с Supabase API (например self-hosted Supabase: PostgREST + Auth и т.д.), и подключить его к Railway PostgreSQL; затем в переменных окружения Railway подставить URL этого API вместо Supabase.
- **Вариант B.** Написать свой backend на Railway (Node/Express и т.д.), который подключается к Railway PostgreSQL и отдаёт данные по REST/GraphQL, и переключить фронтенд на этот backend (например, через отдельную переменную окружения для базового URL API).

Эти шаги выходят за рамки «просто миграции БД» и могут быть выполнены отдельно после того, как вы убедитесь, что оба сайта работают и дамп в Railway корректен.

---

## Краткий чеклист

- [ ] Шаг 1: Создана БД PostgreSQL в Railway, скопирован `DATABASE_URL`.
- [ ] Шаг 2: Получена строка подключения к Supabase (с паролем).
- [ ] Шаг 3: Установлены `pg_dump` и `psql`.
- [ ] Шаг 4: Выполнен `pg_dump` в файл `supabase_full.dump`.
- [ ] Шаг 5: Выполнен `pg_restore` в Railway, проверено наличие данных в `public`.
- [ ] Шаг 6: При необходимости создано расширение `uuid-ossp` в Railway.
- [ ] Шаг 7: Приложение задеплоено на Railway с теми же Supabase-переменными; оба сайта работают параллельно.

После этого у вас два работающих сайта (Vercel + Supabase и Railway с тем же Supabase) и полная копия базы в Railway PostgreSQL, готовая к использованию при добавлении API/self-hosted Supabase.
