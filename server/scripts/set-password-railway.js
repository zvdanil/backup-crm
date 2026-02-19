#!/usr/bin/env node
/**
 * Генерирует SQL для установки/обновления пароля существующему пользователю в Railway.
 * Удобно, если пользователь перенесён из Supabase и в raw_user_meta_data нет password_hash.
 *
 * Запуск из папки server:
 *   npm run set-password -- zd@ukr.net ВашПароль
 *
 * Скопируйте выведенный SQL и выполните в Railway → PostgreSQL → Raw SQL.
 */

import bcrypt from "bcryptjs";

const [,, argEmail, argPassword] = process.argv;
const email = argEmail || process.env.email || process.env.EMAIL;
const password = argPassword || process.env.password || process.env.PASSWORD;

if (!email || !password) {
  console.error("Использование: npm run set-password -- <email> <пароль>");
  console.error("Пример: npm run set-password -- zd@ukr.net in09122206");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const hashEscaped = hash.replace(/'/g, "''");
const emailEscaped = email.replace(/'/g, "''");

const sql = `-- Установить пароль для существующего пользователя (bcrypt, совместим с логином)
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('password_hash', '${hashEscaped}')
WHERE email = '${emailEscaped}';
`;

console.log(sql);
console.log("-- Выполните блок выше в Railway → PostgreSQL → Raw SQL. Затем войдите с этим email и паролем.");
