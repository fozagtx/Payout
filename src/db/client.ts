import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { schema } from "./schema.js";

/** Payout keeps its tables in their own Postgres schema so it can share a database with other apps. */
export const DB_SCHEMA = "payout";

/** Without DATABASE_URL, Payout runs an embedded Postgres (PGlite) stored in this directory. */
export const LOCAL_DB_DIR = ".data/pglite";

export type Database = NodePgDatabase<typeof schema>;

type QueryResult = { rows: Record<string, unknown>[] };

export interface DatabaseConnection {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  release(): void;
}

export interface DatabasePool {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  connect(): Promise<DatabaseConnection>;
  end(): Promise<void>;
}

export function createDatabase(connectionString = process.env.DATABASE_URL): { db: Database; pool: DatabasePool } {
  if (!connectionString) return createLocalDatabase();
  const pool = new Pool({ connectionString });
  pool.on("connect", (client) => {
    client.query(`SET search_path TO ${DB_SCHEMA}`).catch(() => {});
  });
  return { db: drizzle(pool, { schema }), pool };
}

function createLocalDatabase(): { db: Database; pool: DatabasePool } {
  console.warn(`DATABASE_URL is not set: using the local file database in ${LOCAL_DB_DIR} (wiped on every redeploy).`);
  mkdirSync(LOCAL_DB_DIR, { recursive: true });
  const client = new PGlite(LOCAL_DB_DIR);
  const ready = client.exec(`SET search_path TO ${DB_SCHEMA}`);
  const query = async (text: string, params?: unknown[]): Promise<QueryResult> => {
    await ready;
    if (params?.length) return client.query<Record<string, unknown>>(text, params);
    const results = await client.exec(text);
    return results.at(-1) ?? { rows: [] };
  };
  const pool: DatabasePool = {
    query,
    connect: async () => ({ query, release: () => {} }),
    end: () => client.close(),
  };
  return { db: drizzlePglite(client, { schema }) as unknown as Database, pool };
}
