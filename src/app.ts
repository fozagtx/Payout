import express from "express";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import { createMcpKit } from "./mcp-kit/index.js";
import { createAuthRouter } from "./project/api/auth.js";
import { createConnectionsRouter } from "./project/api/connections.js";
import { createImageRouter } from "./project/api/images.js";
import { createAnalyticsRouter } from "./project/api/analytics.js";
import { createMerchantRouter } from "./project/api/merchant.js";
import { createShopRouter } from "./project/api/shop.js";
import { createStorefrontRouter } from "./project/api/storefront.js";
import { createWatchesRouter } from "./project/api/watches.js";
import { BRANDING } from "./project/branding.js";
import { SCOPES } from "./project/scopes.js";
import type { Services } from "./project/services.js";
import { createCookieSession } from "./project/session.js";
import { createRegisterTools } from "./project/tools/index.js";

/**
 * The backend: MCP kit (OAuth + /mcp), the JSON API the Next.js pages call,
 * and the PayPal return route. server.ts mounts Next.js after it, so anything
 * not handled here is a page.
 */
export function createApp(db: Database, config: Config, services: Services) {
  const app = express();
  app.disable("x-powered-by");
  // Behind Render/Fly/Railway/Cloudflare the TLS ends at a proxy. The hop
  // count must match reality, or clients can spoof their IP for rate limits.
  app.set("trust proxy", config.trustProxy);

  const session = createCookieSession(config.sessionSecret, config.apiUrl.startsWith("https://"));

  const mcp = createMcpKit({
    db,
    apiUrl: config.apiUrl,
    secret: config.sessionSecret,
    session,
    branding: BRANDING,
    scopes: SCOPES,
    registerTools: createRegisterTools(services),
    serverInfo: { name: "payout", version: "0.1.0" },
    // Lets scripts/e2e.mjs act as a CIMD client over http://localhost. Only
    // on a local dev server: never behind a tunnel or in production.
    allowLoopbackClientMetadata: !config.production && new URL(config.apiUrl).hostname === "localhost",
  });
  app.use(mcp.router);
  app.use(createAnalyticsRouter(db, session, services));
  app.use(createMerchantRouter(db, session, services));
  app.use(createWatchesRouter(db, session, services, config.channel3WebhookSecret));
  app.use(createStorefrontRouter(db, session, services));
  app.use(createAuthRouter(db, session));
  app.use(createConnectionsRouter(session, mcp.provider, config.apiUrl));
  app.use(createShopRouter(db, session, services));
  if (services.imageSecret) app.use(createImageRouter(services.imageSecret));

  app.get("/health", async (_request, response, next) => {
    try {
      await db.execute(sql`SELECT 1`);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return { app, provider: mcp.provider, session };
}

/** JSON errors for the backend routes. server.ts mounts it before the Next.js catch-all. */
export function errorHandler(
  error: unknown,
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) {
  void next;
  const message = error instanceof Error ? error.message : String(error);
  if (message === "invalid_consent") {
    response.status(400).json({ error: message });
    return;
  }
  console.error(`${request.method} ${request.path}`, error);
  response.status(500).json({ error: "internal_error" });
}
