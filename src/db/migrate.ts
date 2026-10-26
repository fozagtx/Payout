import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createDatabase, DB_SCHEMA } from "./client.js";

const directory = new URL("../../migrations/", import.meta.url);

/** Applies migrations/*.sql in order, skipping ones already applied. */
export async function runMigrations(pool: Pool, log: (line: string) => void = console.log) {
  const connection = await pool.connect();
  try {
    await connection.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA}`);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      const applied = await connection.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (applied.rowCount) continue;
      await connection.query("BEGIN");
      try {
        await connection.query(await readFile(new URL(name, directory), "utf8"));
        await connection.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await connection.query("COMMIT");
        log(`applied ${name}`);
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    connection.release();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { pool } = createDatabase();
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
