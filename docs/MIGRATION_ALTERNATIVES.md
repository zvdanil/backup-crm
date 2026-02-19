# Альтернативы переносу данных и инкрементальное обновление

## 1. Ручной перенос данных

### Вариант A: pg_dump и pg_restore (полный дамп)

Подходит для полного копирования схемы и данных одной парой команд.

1. Установите клиент PostgreSQL (`pg_dump`, `psql`):
   - **Windows:** `winget install PostgreSQL.PostgreSQL` или установщик с postgresql.org (добавьте `bin` в PATH).
   - **macOS:** `brew install libpq && brew link --force libpq`

2. Экспорт из Supabase (подставьте свою `SUPABASE_DATABASE_URL`):
   ```bash
   pg_dump "postgresql://postgres.XXX:PASSWORD@...pooler.supabase.com:6543/postgres" -F c -f supabase_full.dump
   ```
   Пароль возьмите из Supabase → Project Settings → Database.

3. Восстановление в Railway (подставьте свою `RAILWAY_DATABASE_URL`):
   ```bash
   pg_restore -d "postgresql://postgres:PASSWORD@...railway.app:PORT/railway" --no-owner --no-acl -n public supabase_full.dump
   ```
   Если таблицы уже есть (созданы миграциями), используйте:
   ```bash
   pg_restore -d "RAILWAY_DATABASE_URL" --no-owner --no-acl -n public --clean --if-exists supabase_full.dump
   ```

**Минус:** дамп может содержать объекты Supabase (auth, storage), которые на Railway не нужны или конфликтуют. Часто удобнее копировать только схему `public` или только данные (см. ниже).

---

### Вариант B: Только данные (--data-only) после создания схемы на Railway

Если схема на Railway уже создана (миграциями или скриптом), можно перенести только данные:

```bash
# Экспорт только данных из public
pg_dump "SUPABASE_DATABASE_URL" -n public --data-only -F c -f supabase_data.dump

# Восстановление в Railway (таблицы уже должны существовать)
pg_restore -d "RAILWAY_DATABASE_URL" -n public --data-only --no-owner --no-acl supabase_data.dump
```

При конфликтах по первичному ключу `pg_restore` может падать; тогда используйте скрипт с `--upsert` (ниже).

---

### Вариант C: Экспорт в CSV и импорт вручную

1. В Supabase: **Table Editor** → выберите таблицу → **Export** → CSV.
2. В Railway: через панель (Query) или `psql` выполнить загрузку, например:
   ```bash
   psql "RAILWAY_DATABASE_URL" -c "\COPY public.students FROM 'students.csv' WITH (FORMAT csv, HEADER true)"
   ```
   Или вставить данные через SQL/скрипт, сгенерированный из CSV.

Подходит для одной–двух таблиц; для многих таблиц и связей удобнее дамп или скрипт.

---

### Вариант D: Скрипт миграции (уже в проекте)

Из корня проекта:

```bash
node scripts/migrate-to-railway.js
```

Читает Supabase и Railway из `.env.migration` (SUPABASE_DATABASE_URL, RAILWAY_DATABASE_URL), применяет миграции и копирует данные по таблицам. Повторный запуск по умолчанию **не перезаписывает** существующие строки (ON CONFLICT DO NOTHING), поэтому дубликаты не создаются.

---

## 2. Инкрементальное обновление данных

Под «инкрементальным» здесь: повторный перенос из Supabase в Railway с **обновлением** уже существующих строк (а не только добавлением новых).

### Режим --upsert в скрипте миграции

Скрипт поддерживает флаг **`--upsert`**:

```bash
node scripts/migrate-to-railway.js --upsert
```

В этом режиме для таблиц с первичным ключом `id` выполняется не только вставка новых строк, но и обновление существующих при совпадении `id` (ON CONFLICT (id) DO UPDATE SET ...). То есть данные из Supabase перезаписывают соответствующие строки на Railway.

- Первый запуск: как обычная миграция, все данные копируются.
- Последующие запуски с `--upsert`: новые строки добавляются, существующие по `id` обновляются.

Подходит для периодической синхронизации «Supabase → Railway», когда вы продолжаете править данные в Supabase и хотите переносить изменения в Railway.

**Ограничения:**

- Учитываются только таблицы с колонкой `id` и первичным ключом по ней.
- Порядок таблиц и внешние ключи те же, что в обычной миграции (сначала родительские таблицы).
- Удаления в Supabase при этом **не** удаляют строки на Railway (только вставка/обновление).

### Если нужна синхронизация «только новые/изменённые» строки

Для настоящей инкрементальной синхронизации по дате (только строки с `updated_at` > последней синхронизации) нужно доработать скрипт: хранить время последнего запуска и фильтровать в Supabase по `updated_at`. Сейчас такой режим в скрипте не реализован; при необходимости его можно добавить по аналогии с `--upsert`.

---

## Краткая сводка

| Способ | Когда использовать |
|--------|---------------------|
| **pg_dump / pg_restore** | Полный перенос один раз, удобно с уже установленным PostgreSQL. |
| **pg_dump --data-only** | Схема на Railway уже есть, нужно только подтянуть данные. |
| **CSV export/import** | Одна–две таблицы, ручной контроль. |
| **node scripts/migrate-to-railway.js** | Автоматический перенос без установки PostgreSQL, контроль по таблицам. |
| **node scripts/migrate-to-railway.js --upsert** | Повторный перенос с обновлением существующих строк (инкрементальное обновление). |
