import nextModule from "next";
import { createApp, errorHandler } from "./src/app.js";
import { loadConfig } from "./src/config.js";
import { createDatabase } from "./src/db/client.js";
import { ensureDatabaseUrl } from "./src/db/local.js";
import { createLiveServices } from "./src/project/services-live.js";

/**
 * One process, one origin: Express serves the MCP kit (OAuth + /mcp) and
 * /api/*, and hands every other request to Next.js. Sharing the origin means
 * the session cookie set by the Next.js login page is the one the kit's
 * consent screen reads.
 */
const config = loadConfig();
const stopLocalDatabase = await ensureDatabaseUrl();
const { db, pool } = createDatabase();
const { app, provider } = createApp(db, config, createLiveServices(config, db));

// Next.js ships CommonJS; under NodeNext the callable is its `default`.
const createNext = ((nextModule as unknown as { default?: typeof nextModule }).default ?? nextModule) as unknown as typeof nextModule.default;
const nextApp = createNext({ dev: !config.production, dir: import.meta.dirname });
const handle = nextApp.getRequestHandler();
await nextApp.prepare();

app.use("/api", errorHandler);
app.all("/{*path}", (request, response) => handle(request, response));
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Payout: ${config.apiUrl}`);
  console.log(`MCP server: ${new URL("/mcp", config.apiUrl)}`);
});

// Expired codes, tokens, sign-in requests and rate-limit windows.
const purge = setInterval(() => {
  provider.purgeExpired().catch((error: unknown) => console.error("purgeExpired", error));
}, 60 * 60 * 1000);
purge.unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(stopLocalDatabase));
  });
}
