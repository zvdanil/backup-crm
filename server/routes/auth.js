/**
 * Auth API — login, signup, session
 * Заміна Supabase Auth
 *
 * POST /auth/v1/login     — { email, password }
 * POST /auth/v1/signup    — { email, password, parentName, childName }
 * GET  /auth/v1/session   — Authorization: Bearer <token>
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const TOKEN_EXPIRY = "7d";

export const authRouter = Router();

function parseMeta(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

authRouter.post("/login", async (req, res) => {
  try {
    if (!req.db) {
      return res.status(500).json({ error: "Database not configured" });
    }
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const { rows: users } = await req.db.query(
      "SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = $1",
      [email]
    );
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const meta = parseMeta(user.raw_user_meta_data);
    const hash = meta.password_hash ?? null;
    if (!hash || typeof hash !== "string") {
      return res.status(401).json({ error: "Password not set. Use signup or create-first-owner script." });
    }
    let ok = false;
    try {
      ok = await bcrypt.compare(password, hash);
    } catch (err) {
      console.error("[Auth login] bcrypt.compare failed (hash format?)", err?.message);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ access_token: token, token_type: "bearer", user: { id: user.id, email: user.email } });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    console.error("[Auth login] ПОМИЛКА:", msg);
    console.error("[Auth login] Деталі:", e);
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
});

authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password, parentName, childName } = req.body;
    if (!email || !password || !parentName || !childName) {
      return res.status(400).json({ error: "email, password, parentName, childName required" });
    }
    const { rows: existing } = await req.db.query(
      "SELECT id FROM auth.users WHERE email = $1",
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await req.db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, email, JSON.stringify({
        full_name: parentName,
        parent_name: parentName,
        child_name: childName,
        password_hash: hash,
      })]
    );
    const { rows: countRows } = await req.db.query("SELECT COUNT(*)::int as c FROM public.user_profiles");
    const role = (countRows[0]?.c ?? 0) === 0 ? "owner" : "newregistration";
    await req.db.query(
      `INSERT INTO public.user_profiles (id, full_name, parent_name, child_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, false)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, parent_name = EXCLUDED.parent_name, child_name = EXCLUDED.child_name`,
      [id, parentName, parentName, childName, role]
    );
    const token = jwt.sign({ sub: id, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.status(201).json({ access_token: token, token_type: "bearer", user: { id, email } });
  } catch (e) {
    console.error("[Auth signup]", e);
    res.status(500).json({ error: e.message });
  }
});

authRouter.get("/session", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token" });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await req.db.query(
      "SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1",
      [decoded.sub]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ user: { id: user.id, email: user.email } });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});
