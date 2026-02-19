#!/usr/bin/env node
/**
 * Генерує SQL для створення першого owner у Railway.
 * Хеш пароля через bcryptjs (як у логіні), тому вхід гарантовано працює.
 *
 * Запуск з папки server:
 *   npm run create-first-owner -- zd@ukr.net YourPassword
 *   (на Windows також працює; на Linux/Mac можна: email=... password=... npm run create-first-owner)
 * Скопіюйте виведений SQL і виконайте в Railway → PostgreSQL → Raw SQL.
 */

import bcrypt from "bcryptjs";

const [,, argEmail, argPassword] = process.argv;
const email = argEmail || process.env.email || process.env.EMAIL || "admin@example.com";
const password = argPassword || process.env.password || process.env.PASSWORD || "YOUR_PASSWORD";
const fullName = process.env.fullName || process.env.FULL_NAME || "Admin";

const hash = await bcrypt.hash(password, 10);
const hashEscaped = hash.replace(/'/g, "''");
const emailEscaped = email.replace(/'/g, "''");
const nameEscaped = fullName.replace(/'/g, "''");

const sql = `-- Перший owner (хеш з bcryptjs — сумісний з логіном)
WITH new_user AS (
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (
    gen_random_uuid(),
    '${emailEscaped}',
    '{"password_hash": "${hashEscaped}", "full_name": "${nameEscaped}", "parent_name": "${nameEscaped}", "child_name": "${nameEscaped}"}'::jsonb
  )
  RETURNING id
)
INSERT INTO public.user_profiles (id, full_name, parent_name, child_name, role, is_active)
SELECT id, '${nameEscaped}', '${nameEscaped}', '${nameEscaped}', 'owner', true FROM new_user;
`;

console.log(sql);
console.log("\n-- Виконайте блок вище в Railway → PostgreSQL → Raw SQL. Потім увійдіть з email та паролем.");
