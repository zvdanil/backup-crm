#!/usr/bin/env node
/**
 * Міграція БД з Supabase на Railway PostgreSQL
 *
 * Використання:
 *   SUPABASE_DATABASE_URL="postgresql://..." RAILWAY_DATABASE_URL="postgresql://..." node scripts/migrate-to-railway.js
 *
 * Або створіть .env.migration (не комітити!) з рядками:
 *   SUPABASE_DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@...supabase.com:6543/postgres
 *   RAILWAY_DATABASE_URL=postgresql://postgres:[PASSWORD]@...railway.app:6543/railway
 * І запустіть: node scripts/migrate-to-railway.js
 * (скрипт підхопить .env.migration якщо є пакет dotenv)
 *
 * Інкрементальне оновлення (перезапис існуючих рядків за id):
 *   node scripts/migrate-to-railway.js --upsert
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const { config } = await import("dotenv");
  const envPath = path.join(__dirname, "..", ".env.migration");
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
  }
} catch (_) {}
const { Client } = pg;

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;
const RAILWAY_URL = process.env.RAILWAY_DATABASE_URL;

const UPSERT = process.argv.includes("--upsert");

if (!SUPABASE_URL || !RAILWAY_URL) {
  console.error(
    "\n❌ Потрібні змінні: SUPABASE_DATABASE_URL і RAILWAY_DATABASE_URL\n" +
      "   Приклад: SUPABASE_DATABASE_URL=\"postgresql://...\" RAILWAY_DATABASE_URL=\"postgresql://...\" node scripts/migrate-to-railway.js\n" +
      "   Або додайте їх у .env.migration і запустіть: node scripts/load-env.js node scripts/migrate-to-railway.js\n"
  );
  process.exit(1);
}

function parsePgUrl(url) {
  const u = new URL(url);
  const auth = u.username ? decodeURIComponent(u.username) : "";
  const pass = u.password ? decodeURIComponent(u.password) : "";
  return {
    host: u.hostname,
    port: parseInt(u.port || "5432", 10),
    user: auth,
    password: pass,
    database: (u.pathname || "/postgres").slice(1) || "postgres",
    ssl: url.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  };
}

async function runSql(client, sql, label = "") {
  try {
    await client.query(sql);
    if (label) console.log(`   ✓ ${label}`);
  } catch (e) {
    if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
      if (label) console.log(`   ⚠ ${label} (вже існує)`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const railwayConfig = parsePgUrl(RAILWAY_URL);
  const railway = new Client(
    railwayConfig.ssl ? railwayConfig : { connectionString: RAILWAY_URL }
  );
  const supabase = new Client(parsePgUrl(SUPABASE_URL));

  try {
    await railway.connect();
    await supabase.connect();
    console.log("\n📦 Підключено до Supabase та Railway\n");
    if (UPSERT) console.log("   🔄 Режим --upsert: існуючі рядки (за id) будуть оновлені.\n");

    // 1. Підготовка Railway: auth schema, stub auth.users, Supabase-ролі для GRANT у міграціях
    console.log("1️⃣  Створення схеми auth, заглушки auth.users та ролей...");
    await runSql(
      railway,
      `
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB
      );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
      END $$;
    `,
      "auth.users stub + roles authenticated, anon"
    );

    // 2. Розширення uuid
    console.log("\n2️⃣  Створення розширень...");
    await runSql(railway, 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', "uuid-ossp");
    await runSql(railway, "CREATE EXTENSION IF NOT EXISTS pgcrypto;", "pgcrypto");

    // 3. Запуск міграцій
    console.log("\n3️⃣  Застосування міграцій...");
    const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const filepath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(filepath, "utf-8");

      // Пропускаємо міграції, що створюють тригери на auth.users (вони не спрацюють без Supabase Auth)
      if (
        sql.includes("CREATE TRIGGER") &&
        sql.includes("auth.users") &&
        !sql.includes("CREATE TABLE")
      ) {
        console.log(`   ⏭ ${file} (пропуск тригера auth)`);
        continue;
      }

      try {
        await railway.query(sql);
        console.log(`   ✓ ${file}`);
      } catch (e) {
        if (
          e.message?.includes("already exists") ||
          e.message?.includes("duplicate_object")
        ) {
          console.log(`   ⚠ ${file} (частина вже застосована)`);
        } else {
          console.error(`   ❌ ${file}: ${e.message}`);
          throw e;
        }
      }
    }

    // 4. Копіювання даних
    console.log("\n4️⃣  Копіювання даних...");

    // Діагностика: скільки рядків у джерелі (Supabase)
    const countTables = ["students", "groups", "user_profiles", "enrollments", "attendance"];
    console.log("   📊 Кількість рядків у Supabase (джерело):");
    let sourceTotal = 0;
    for (const t of countTables) {
      try {
        const { rows: r } = await supabase.query(`SELECT COUNT(*)::int AS c FROM public."${t}"`);
        const c = r[0]?.c ?? 0;
        sourceTotal += c;
        console.log(`      ${t}: ${c}`);
      } catch {
        console.log(`      ${t}: (таблиця відсутня)`);
      }
    }
    if (sourceTotal === 0) {
      console.log("\n   ⚠️  У Supabase немає даних у цих таблицях. Переконайтесь, що:");
      console.log("      • SUPABASE_DATABASE_URL — це рядок підключення до PostgreSQL (не API URL);");
      console.log("      • у проєкті Supabase є дані. Копіювання продовжиться для інших таблиць.\n");
    }

    const { rows: tableRows } = await supabase.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const publicTables = tableRows.map((r) => r.tablename);

    // Порядок з урахуванням FK (батьківські таблиці перед дочірніми)
    const order = [
      "students",
      "groups",
      "activities",
      "staff",
      "payment_accounts",
      "expense_categories",
      "staff_billing_rules",
      "staff_manual_rate_activities",
      "holidays",
      "user_profiles",
      "parent_student_links",
      "enrollments",
      "attendance",
      "account_transfers",
      "finance_transactions",
      "staff_journal_entries",
      "staff_payouts",
      "expense_journal_entries",
      "account_opening_balances",
      "enrollment_price_history",
      "dividend_participants",
      "dividend_payouts",
      "dividend_payout_legs",
    ];

    const tablesToCopy = order.filter((t) => publicTables.includes(t));
    const extraTables = publicTables.filter((t) => !order.includes(t));
    const allTables = [...tablesToCopy, ...extraTables];

    // Спочатку спробуємо скопіювати auth.users
    try {
      const { rows: authRows } = await supabase.query(
        "SELECT id, email, raw_user_meta_data FROM auth.users"
      );
      if (authRows?.length > 0) {
        for (const row of authRows) {
          await railway.query(
            `INSERT INTO auth.users (id, email, raw_user_meta_data)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, raw_user_meta_data = EXCLUDED.raw_user_meta_data`,
            [row.id, row.email || null, row.raw_user_meta_data || null]
          );
        }
        console.log(`   ✓ auth.users (${authRows.length} рядків)`);
      }
    } catch (e) {
      console.log(`   ⚠ auth.users (немає доступу, буде заповнено з user_profiles)`);
    }

    for (const table of allTables) {
      try {
        const { rows } = await supabase.query(`SELECT * FROM public."${table}"`);
        if (rows.length === 0) {
          console.log(`   - public.${table} (порожня)`);
          continue;
        }

        if (table === "user_profiles") {
          for (const row of rows) {
            await railway.query(
              `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
              [row.id]
            );
          }
        }

        if (table === "account_transfers") {
          const ids = new Set();
          rows.forEach((r) => {
            if (r.created_by) ids.add(r.created_by);
            if (r.cancelled_by) ids.add(r.cancelled_by);
          });
          for (const id of ids) {
            await railway.query(
              `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
              [id]
            );
          }
        }

        const sourceCols = Object.keys(rows[0]).filter((c) => rows[0][c] !== undefined);
        const { rows: targetColRows } = await railway.query(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
          [table]
        );
        if (targetColRows.length === 0) {
          console.log(`   ⏭ public.${table} (таблиця відсутня на Railway — пропуск)`);
          continue;
        }
        const targetCols = new Set(targetColRows.map((r) => r.column_name));
        const colTypes = Object.fromEntries(targetColRows.map((r) => [r.column_name, r.data_type]));
        const cols = sourceCols.filter((c) => targetCols.has(c));
        const skippedCols = sourceCols.filter((c) => !targetCols.has(c));
        if (skippedCols.length > 0) {
          console.log(`   ℹ public.${table}: колонки тільки в джерелі (пропущено): ${skippedCols.join(", ")}`);
        }

        function coerceJsonValue(val, dataType) {
          if (dataType !== "json" && dataType !== "jsonb") return val;
          if (val == null || val === undefined) return null;
          if (val === "") return null;
          if (typeof val === "object" || typeof val === "number" || typeof val === "boolean") {
            return JSON.stringify(val);
          }
          if (typeof val === "string") {
            try {
              JSON.parse(val);
              return val;
            } catch {
              return null;
            }
          }
          return null;
        }

        const colList = cols.map((c) => `"${c}"`).join(", ");
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const hasId = cols.includes("id");
        let conflictClause = "";
        if (hasId) {
          if (UPSERT) {
            const updateCols = cols.filter((c) => c !== "id").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
            conflictClause = updateCols ? ` ON CONFLICT (id) DO UPDATE SET ${updateCols}` : " ON CONFLICT (id) DO NOTHING";
          } else {
            conflictClause = " ON CONFLICT (id) DO NOTHING";
          }
        }
        const insertSql = `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders})${conflictClause}`;
        const BATCH_SIZE = 80;
        const PROGRESS_EVERY = 200;

        let inserted = 0;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          if (batch.length === 0) break;

          if (rows.length > PROGRESS_EVERY && (i + batch.length) % PROGRESS_EVERY < BATCH_SIZE) {
            process.stdout.write(`\r   … public.${table} ${Math.min(i + batch.length, rows.length)}/${rows.length}\r`);
          }

          for (const row of batch) {
            const values = cols.map((c) => {
              const v = coerceJsonValue(row[c], colTypes[c]);
              return v === undefined ? null : v;
            });
            try {
              const res = await railway.query(insertSql, values);
              if (res.rowCount > 0) inserted++;
            } catch (err) {
              if (
                !err.message?.includes("duplicate") &&
                !err.message?.includes("violates foreign key") &&
                !err.message?.includes("already exists")
              ) {
                console.error(`   ❌ public.${table} рядок: ${err.message}`);
              }
            }
          }
        }
        if (rows.length > PROGRESS_EVERY) process.stdout.write(" ".repeat(50) + "\r");
        console.log(`   ✓ public.${table} (${inserted}/${rows.length})`);
        if (rows.length > 0 && inserted === 0) {
          console.log(`   ℹ Усі рядки пропущені (дублікати або порушення FK). Перевірте порядок таблиць і наявність батьківських записів.`);
        }
      } catch (e) {
        console.error(`   ❌ public.${table}: ${e.message}`);
      }
    }

    // Підсумок: скільки рядків на Railway після копіювання
    console.log("\n   📊 Кількість рядків на Railway (після копіювання):");
    for (const t of countTables) {
      try {
        const { rows: r } = await railway.query(`SELECT COUNT(*)::int AS c FROM public."${t}"`);
        console.log(`      ${t}: ${r[0]?.c ?? 0}`);
      } catch {
        console.log(`      ${t}: (таблиця відсутня)`);
      }
    }

    console.log("\n✅ Міграцію завершено.\n");
  } catch (e) {
    console.error("\n❌ Помилка:", e.message);
    process.exit(1);
  } finally {
    await railway.end();
    await supabase.end();
  }
}

main();
