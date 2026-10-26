import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, errorHandler } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { createDatabase, DB_SCHEMA, type Database } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { connections, oauthClients, oauthTokens } from "../../src/mcp-kit/schema.js";
import { users } from "../../src/project/schema.js";
import type { Catalog, Payments, Services } from "../../src/project/services.js";
import { hashPassword } from "../../src/lib/password.js";
import { SCOPES, type Scope } from "../../src/project/scopes.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://mcp:mcp@127.0.0.1:5434/mcp_test";

/** Drops and re-migrates the test database. Test files run one at a time (vitest.config.ts). */
export async function freshDatabase() {
  const { db, pool } = createDatabase(TEST_DATABASE_URL);
  await pool.query(`DROP SCHEMA IF EXISTS ${DB_SCHEMA} CASCADE`);
  await runMigrations(pool, () => {});
  return { db, pool };
}

const unusedCatalog: Catalog = {
  search: async () => { throw new Error("catalog not faked in this test"); },
  get: async () => { throw new Error("catalog not faked in this test"); },
};
const unusedPayments: Payments = {
  createOrder: async () => { throw new Error("payments not faked in this test"); },
  getOrder: async () => { throw new Error("payments not faked in this test"); },
  captureOrder: async () => { throw new Error("payments not faked in this test"); },
  refundCapture: async () => { throw new Error("payments not faked in this test"); },
  listDisputes: async () => { throw new Error("payments not faked in this test"); },
  verifyWebhook: async () => { throw new Error("payments not faked in this test"); },
};

export interface TestServer {
  baseUrl: string;
  db: Database;
  close(): Promise<void>;
}

/** The backend (no Next.js) on a random port, against a fresh test database. */
export async function startServer(services: Partial<Omit<Services, "publicUrl">> = {}, env: Partial<NodeJS.ProcessEnv> = {}): Promise<TestServer> {
  const { db, pool } = await freshDatabase();
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  const config = loadConfig({
    ...env,
    PUBLIC_API_URL: baseUrl,
    SESSION_SECRET: "test-secret-test-secret-test-secret-123",
    TRUST_PROXY: "0",
    NODE_ENV: "test",
  });
  const { app } = createApp(db, config, {
    catalog: services.catalog ?? unusedCatalog,
    payments: services.payments ?? unusedPayments,
    publicUrl: baseUrl,
    ...(services.storefront ? { storefront: services.storefront } : {}),
    ...(services.imageSecret ? { imageSecret: services.imageSecret } : {}),
  });
  app.use(errorHandler);
  server.on("request", app);
  return {
    baseUrl,
    db,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    },
  };
}

/** Signs up through the API and returns the session cookie. */
export async function signUp(baseUrl: string, username = "alice", password = "password123") {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status !== 201) throw new Error(`signup failed: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  const me = (await (await fetch(`${baseUrl}/api/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  return { cookie, userId: me.user.id };
}

/**
 * Skips the OAuth dance (covered by scripts/e2e.mjs): inserts a client,
 * connection and access token for `userId`, and returns the bearer token.
 */
export async function issueAccessToken(
  db: Database,
  baseUrl: string,
  userId: string,
  scopes: Scope[] = Object.keys(SCOPES) as Scope[]
) {
  const clientId = `test-client-${randomBytes(4).toString("hex")}`;
  await db.insert(oauthClients).values({
    id: clientId,
    name: "Test Client",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    metadata: {},
  });
  const [connection] = await db
    .insert(connections)
    .values({ userId, clientId, scopes })
    .returning({ id: connections.id });
  const token = randomBytes(32).toString("base64url");
  await db.insert(oauthTokens).values({
    connectionId: connection!.id,
    clientId,
    hash: createHash("sha256").update(token).digest("hex"),
    type: "access",
    familyId: crypto.randomUUID(),
    scopes,
    resource: `${baseUrl}/mcp`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  return { token, connectionId: connection!.id };
}

/** One JSON-RPC call to /mcp. Returns the parsed `result` (or throws on a JSON-RPC error). */
export async function mcpCall(baseUrl: string, token: string, method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const body = JSON.parse(line ? line.slice(6) : text) as { result?: any; error?: { message: string } };
  if (body.error) throw new Error(`MCP error: ${body.error.message}`);
  return body.result;
}

/** tools/call, returning the tool's structuredContent and isError. */
export async function callTool(baseUrl: string, token: string, name: string, args: Record<string, unknown> = {}) {
  const result = await mcpCall(baseUrl, token, "tools/call", { name, arguments: args });
  return { data: result.structuredContent as Record<string, any>, isError: Boolean(result.isError), raw: result };
}

export { users, hashPassword };
