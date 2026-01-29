#!/usr/bin/env bun
import { Client } from "pg";
import fs from "fs/promises";

async function loadConnectionStringFromEnvOrDotenv() {
  let conn =
    process.env.RAILWAY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL;

  if (conn) return conn;

  try {
    const dotenvRaw = await fs.readFile(".env", "utf8");
    for (const rawLine of dotenvRaw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (
        key === "RAILWAY_DATABASE_URL" ||
        key === "DATABASE_URL" ||
        key === "SUPABASE_DB_URL" ||
        key === "SUPABASE_DATABASE_URL"
      ) {
        conn = val;
        break;
      }
    }
  } catch (err) {
    // ignore - .env might not exist
  }

  return conn;
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.replace(/"/g, '""');
}

async function main() {
  const connectionString = await loadConnectionStringFromEnvOrDotenv();
  if (!connectionString) {
    console.error(
      "Database connection string not found. Set RAILWAY_DATABASE_URL or DATABASE_URL env var, or add it to .env"
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const query = `
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;

  const res = await client.query(query);

  const header = '"table_name","column_name","data_type","is_nullable"';
  const lines = [header];
  for (const row of res.rows) {
    lines.push(
      `"${csvEscape(row.table_name)}","${csvEscape(
        row.column_name
      )}","${csvEscape(row.data_type)}","${csvEscape(row.is_nullable)}"`
    );
  }

  const out = lines.join("\n") + "\n";
  await fs.writeFile("database_schema.md", out, "utf8");
  console.log(`Wrote database_schema.md (${res.rowCount} columns)`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

