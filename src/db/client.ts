import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema.js";

/** Payout keeps its tables in their own Postgres schema so it can share a database with other apps. */
export const DB_SCHEMA = "payout";

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  pool.on("connect", (client) => {
    client.query(`SET search_path TO ${DB_SCHEMA}`).catch(() => {});
  });
  return { db: drizzle(pool, { schema }), pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];
