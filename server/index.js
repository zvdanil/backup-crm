#!/usr/bin/env node
/**
 * API сервер для CRM — підключення до Railway PostgreSQL
 * Заміна Supabase REST API
 *
 * Запуск: DATABASE_URL="postgresql://..." node index.js
 * Або створіть .env з DATABASE_URL
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import { apiRouter } from "./routes/api.js";
import { authRouter } from "./routes/auth.js";
import { rpcRouter } from "./routes/rpc.js";

const PORT = process.env.PORT || 3001;

if (!process.env.DATABASE_URL) {
  console.error("Помилка: DATABASE_URL не задано. Створіть server/.env з DATABASE_URL=postgresql://...");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Всі під /api для проксі Vite
app.use("/api/rest/v1", apiRouter);
app.use("/api/auth/v1", authRouter);
app.use("/api/rpc", rpcRouter);

app.get("/health", (_, res) => res.json({ ok: true }));

// Глобальний обробник помилок — завжди повертає JSON
app.use((err, req, res, next) => {
  console.error("[Express error]", err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || String(err) });
});

pool.query("SELECT 1").then(() => {
  console.log("База даних: підключено");
}).catch((err) => {
  console.error("База даних: помилка підключення —", err.message);
});

app.listen(PORT, () => {
  console.log(`API сервер: http://localhost:${PORT}`);
});
