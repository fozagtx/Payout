import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { userInfo } from "node:os";
import EmbeddedPostgres from "embedded-postgres";

/** Without DATABASE_URL, Payout runs a bundled Postgres server whose data lives here. */
export const LOCAL_DB_DIR = ".data/postgres";
const LOCAL_DB_PORT = 5435;

/**
 * Makes sure process.env.DATABASE_URL points at a Postgres. When it isn't set, starts the
 * bundled Postgres (real Postgres, ~100 MB RAM) and returns a function that stops it.
 */
export async function ensureDatabaseUrl(): Promise<() => Promise<void>> {
  if (process.env.DATABASE_URL) return async () => {};
  console.warn(`DATABASE_URL is not set: starting the bundled Postgres in ${LOCAL_DB_DIR} (wiped on every Render redeploy).`);
  const databaseDir = resolve(LOCAL_DB_DIR);
  mkdirSync(dirname(databaseDir), { recursive: true });
  const server = new EmbeddedPostgres({
    databaseDir,
    port: LOCAL_DB_PORT,
    user: "payout",
    password: "payout",
    persistent: true,
    createPostgresUser: userInfo().uid === 0,
    onLog: () => {},
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "shared_buffers=16MB", "-c", "max_connections=20"],
  });
  if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await server.initialise();
  await server.start();
  process.env.DATABASE_URL = `postgres://payout:payout@127.0.0.1:${LOCAL_DB_PORT}/postgres`;
  return () => server.stop();
}
