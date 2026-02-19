#!/usr/bin/env node
/**
 * Автоматична перевірка: API доступний, БД підключена, дані в ключових таблицях.
 * Мінімальна участь: запустити з кореня проєкту.
 *
 *   node scripts/check-railway-setup.js
 *
 * Скрипт сам підхопить:
 *   - server/.env         → DATABASE_URL (для перевірки БД)
 *   - .env.migration      → RAILWAY_DATABASE_URL (якщо немає server/.env)
 *   - API URL             → VITE_RAILWAY_API_URL або RAILWAY_API_URL, інакше http://localhost:3001
 *
 * Код виходу: 0 — усе ок, 1 — є помилки.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  const p = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!fs.existsSync(p)) return;
  try {
    dotenv.config({ path: p });
  } catch {
    let text = fs.readFileSync(p, "utf-8").replace(/^\uFEFF/, "");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const val = m[2].replace(/^["']|["']$/g, "").trim().replace(/\r$/, "");
        if (process.env[m[1]] == null) process.env[m[1]] = val;
      }
    }
  }
}

loadEnvFile("server/.env");
loadEnvFile(".env.migration");
loadEnvFile(".env");

const DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL;
const API_BASE = (process.env.RAILWAY_API_URL || process.env.VITE_RAILWAY_API_URL || "http://localhost:3001").replace(/\/$/, "");

const TABLES_TO_CHECK = ["students", "user_profiles", "groups", "enrollments"];

async function fetchJson(url) {
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const text = await res.text();
  let data = null;
  if (text) try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function checkApiHealth() {
  try {
    const { ok, status, data } = await fetchJson(`${API_BASE}/health`);
    if (ok && data && data.ok === true) return { ok: true };
    return { ok: false, msg: `health повернув ${status} або не { ok: true }` };
  } catch (e) {
    return { ok: false, msg: e.message || String(e) };
  }
}

async function checkApiStudents() {
  try {
    const { ok, status, data } = await fetchJson(`${API_BASE}/api/rest/v1/students?limit=5`);
    if (!ok) return { ok: false, msg: `GET /api/rest/v1/students → ${status}` };
    if (!Array.isArray(data)) return { ok: false, msg: "відповідь не масив" };
    return { ok: true, count: data.length };
  } catch (e) {
    return { ok: false, msg: e.message || String(e) };
  }
}

async function checkDatabase() {
  if (!DATABASE_URL) return { ok: false, msg: "немає DATABASE_URL (server/.env або .env.migration)" };
  let client;
  try {
    const pg = await import("pg");
    client = new pg.Client({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    const counts = {};
    for (const table of TABLES_TO_CHECK) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM public."${table}"`);
        counts[table] = rows[0]?.c ?? 0;
      } catch {
        counts[table] = null;
      }
    }
    await client.end();
    return { ok: true, counts };
  } catch (e) {
    if (client) try { await client.end(); } catch {}
    return { ok: false, msg: e.message || String(e) };
  }
}

async function main() {
  console.log("\n🔍 Перевірка Railway-середовища\n");
  console.log("   API URL:", API_BASE);
  console.log("   DATABASE_URL:", DATABASE_URL ? `${DATABASE_URL.slice(0, 30)}...` : "(не задано)");
  console.log("");

  let failed = 0;

  // 1. API health
  process.stdout.write("   1. API /health .................. ");
  const health = await checkApiHealth();
  if (health.ok) {
    console.log("✓");
  } else {
    console.log("✗", health.msg);
    failed++;
  }

  // 2. API students
  process.stdout.write("   2. API GET /api/rest/v1/students ");
  const students = await checkApiStudents();
  if (students.ok) {
    console.log("✓", students.count !== undefined ? `(зразок: ${students.count} записів)` : "");
  } else {
    console.log("✗", students.msg);
    failed++;
  }

  // 3. DB підключення та таблиці
  process.stdout.write("   3. БД підключення + таблиці ..... ");
  const db = await checkDatabase();
  if (db.ok) {
    console.log("✓");
    if (db.counts) {
      for (const [table, c] of Object.entries(db.counts)) {
        const v = c === null ? "—" : c;
        console.log(`      public.${table}: ${v}`);
      }
    }
  } else {
    console.log("✗", db.msg);
    failed++;
  }

  console.log("");
  if (failed === 0) {
    console.log("   ✅ Усе пройдено. API та БД у порядку.\n");
    process.exit(0);
  } else {
    console.log("   ❌ Помилок:", failed);
    console.log("");
    console.log("   Що перевірити:");
    if (!health.ok) console.log("   • Запустити API: cd server && npm run dev");
    if (!health.ok || !students.ok) console.log("   • Якщо API на іншому хості — задати RAILWAY_API_URL або VITE_RAILWAY_API_URL у .env");
    if (!db.ok && DATABASE_URL) console.log("   • DATABASE_URL у server/.env (той самий, що в Railway для API)");
    if (!db.ok && !DATABASE_URL) console.log("   • Додати DATABASE_URL у server/.env або RAILWAY_DATABASE_URL у .env.migration");
    console.log("");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
