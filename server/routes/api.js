/**
 * Generic CRUD API — заміна supabase.from('table').select/insert/update/delete
 *
 * GET    /api/:table           — select (query: select, eq, order, limit)
 * GET    /api/:table?id=eq.xxx — filter by id
 * POST   /api/:table           — insert
 * PATCH  /api/:table?id=eq.xxx — update by id
 * DELETE /api/:table?id=eq.xxx — delete by id
 */

import { Router } from "express";

const ALLOWED_TABLES = new Set([
  "students", "groups", "activities", "staff", "payment_accounts", "expense_categories",
  "staff_billing_rules", "staff_manual_rate_activities", "holidays", "user_profiles",
  "parent_student_links", "enrollments", "attendance", "account_transfers",
  "finance_transactions", "staff_journal_entries", "staff_payouts", "expense_journal_entries",
  "expense_articles", "account_opening_balances", "enrollment_price_history",
  "dividend_participants", "dividend_payouts", "dividend_payout_legs",
  "lesson_activities", "group_lessons", "group_lesson_sessions", "group_lesson_staff",
  "activity_teacher_history", "staff_manual_rate_history",
]);

// Supabase embed syntax: "*, groups (...)", "*, activities (*)", "*, students (...), activities (...)" — emulate via JOIN.
function toCols(select, table) {
  if (!select || select === "*") return { cols: "*", join: null };
  const s = String(select).trim();
  if (s.includes("(")) {
    const groupsMatch = s.match(/\bgroups\s*\(\s*[^)]+\s*\)/);
    const activitiesMatch = s.match(/\bactivities\s*\(\s*[^)]+\s*\)/);
    const studentsMatch = s.match(/\bstudents\s*\(\s*[^)]+\s*\)/);
    if (groupsMatch && table === "students") return { cols: "*", join: { type: "groups", table: "groups", fk: "group_id" } };
    if (activitiesMatch && !studentsMatch && table === "enrollments") return { cols: "*", join: { type: "activities", table: "activities", fk: "activity_id" } };
    if (studentsMatch && activitiesMatch && table === "enrollments") return { cols: "*", join: { type: "enrollments_full", studentsFk: "student_id", activitiesFk: "activity_id" } };
    if (activitiesMatch && table === "enrollments") return { cols: "*", join: { type: "activities", table: "activities", fk: "activity_id" } };
    return { cols: "*", join: null };
  }
  const cols = s.split(",").map((c) => c.trim()).filter(Boolean).map((c) => `"${c}"`).join(", ");
  return { cols: cols || "*", join: null };
}

export const apiRouter = Router();

apiRouter.get("/:table", async (req, res) => {
  const table = req.params.table;
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    const { select, id, order, limit, offset, ...rest } = req.query;
    const { cols, join } = toCols(select, table);
    const tbl = `public."${table}"`;
    const tblAlias = join ? "main" : tbl;
    let sql;
    if (join?.type === "groups") {
      sql = `SELECT main.*, g.id AS "groups_id", g.name AS "groups_name", g.color AS "groups_color" FROM ${tbl} main LEFT JOIN public."groups" g ON main."${join.fk}" = g.id`;
    } else if (join?.type === "activities") {
      sql = `SELECT main.*, (CASE WHEN a.id IS NOT NULL THEN row_to_json(a)::jsonb ELSE NULL END) AS activities FROM ${tbl} main LEFT JOIN public."activities" a ON main."${join.fk}" = a.id`;
    } else if (join?.type === "enrollments_full") {
      sql = `SELECT main.*,
        (CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id', s.id, 'full_name', s.full_name) ELSE NULL END) AS students,
        (CASE WHEN a.id IS NOT NULL THEN row_to_json(a)::jsonb ELSE NULL END) AS activities
        FROM ${tbl} main
        LEFT JOIN public."students" s ON main."${join.studentsFk}" = s.id
        LEFT JOIN public."activities" a ON main."${join.activitiesFk}" = a.id`;
    } else {
      sql = `SELECT ${cols} FROM ${tbl}`;
    }
    const params = [];
    let idx = 1;
    const whereParts = [];
    if (id) {
      whereParts.push(`${join ? "main" : tbl}.id = $${idx}`);
      params.push(id);
      idx++;
    }
    for (const [k, v] of Object.entries(rest)) {
      if (v == null || v === "") continue;
      const str = String(v);
      if (k.startsWith("gte_")) {
        const col = k.slice(4);
        whereParts.push(`${join ? "main" : tbl}."${col}" >= $${idx}`);
        params.push(str);
        idx++;
      } else if (k.startsWith("lte_")) {
        const col = k.slice(4);
        whereParts.push(`${join ? "main" : tbl}."${col}" <= $${idx}`);
        params.push(str);
        idx++;
      } else if (k.startsWith("gt_")) {
        const col = k.slice(3);
        whereParts.push(`${join ? "main" : tbl}."${col}" > $${idx}`);
        params.push(str);
        idx++;
      } else if (k.startsWith("lt_")) {
        const col = k.slice(3);
        whereParts.push(`${join ? "main" : tbl}."${col}" < $${idx}`);
        params.push(str);
        idx++;
      } else if (k.startsWith("notnull_")) {
        const col = k.slice(8);
        whereParts.push(`${join ? "main" : tbl}."${col}" IS NOT NULL`);
      } else if (k.startsWith("in_")) {
        const col = k.slice(3);
        const vals = str.split(",").map((v) => v.trim()).filter(Boolean);
        if (vals.length > 0) {
          const placeholders = vals.map(() => `$${idx++}`).join(", ");
          whereParts.push(`${join ? "main" : tbl}."${col}" IN (${placeholders})`);
          params.push(...vals);
        }
      } else if (/^[a-z_][a-z0-9_]*$/i.test(k)) {
        // equality: student_id, type, activity_id, etc.
        whereParts.push(`${join ? "main" : tbl}."${k}" = $${idx}`);
        params.push(str);
        idx++;
      }
    }
    if (whereParts.length > 0) sql += " WHERE " + whereParts.join(" AND ");
    if (order) {
      const [col, dir = "asc"] = String(order).split(".");
      sql += ` ORDER BY ${tblAlias}."${col}" ${dir.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
    }
    if (limit) {
      sql += ` LIMIT $${idx}`;
      params.push(parseInt(String(limit), 10) || 100);
      idx++;
    }
    if (offset) {
      sql += ` OFFSET $${idx}`;
      params.push(parseInt(String(offset), 10) || 0);
    }
    const { rows } = await req.db.query(sql, params);
    let out = rows;
    if (join && rows.length > 0 && ("groups_id" in rows[0] || "groups_name" in rows[0])) {
      out = rows.map((r) => {
        const { groups_id, groups_name, groups_color, ...rest } = r;
        return { ...rest, groups: groups_id ? [{ id: groups_id, name: groups_name, color: groups_color }] : null };
      });
    }
    res.json(out);
  } catch (e) {
    console.error("[API GET]", e);
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post("/:table", async (req, res) => {
  const table = req.params.table;
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    const body = req.body;
    const cols = Object.keys(body).filter((k) => body[k] !== undefined);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => body[c]);
    const sql = `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders}) RETURNING *`;
    const { rows } = await req.db.query(sql, values);
    res.status(201).json(rows[0] ?? body);
  } catch (e) {
    console.error("[API POST]", e);
    res.status(500).json({ error: e.message });
  }
});

apiRouter.patch("/:table", async (req, res) => {
  const table = req.params.table;
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(404).json({ error: "Not found" });
  }
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "?id= required" });
  try {
    const body = req.body;
    const cols = Object.keys(body).filter((k) => body[k] !== undefined && k !== "id");
    if (cols.length === 0) return res.status(400).json({ error: "No fields to update" });
    const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
    const values = [...cols.map((c) => body[c]), id];
    const sql = `UPDATE public."${table}" SET ${setClause} WHERE id = $${cols.length + 1} RETURNING *`;
    const { rows } = await req.db.query(sql, values);
    res.json(rows[0] ?? null);
  } catch (e) {
    console.error("[API PATCH]", e);
    res.status(500).json({ error: e.message });
  }
});

apiRouter.delete("/:table", async (req, res) => {
  const table = req.params.table;
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(404).json({ error: "Not found" });
  }
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "?id= required" });
  try {
    await req.db.query(`DELETE FROM public."${table}" WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (e) {
    console.error("[API DELETE]", e);
    res.status(500).json({ error: e.message });
  }
});
