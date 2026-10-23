import { Router } from "express";
import type { Session } from "../../mcp-kit/index.js";

interface ConnectionStore {
  listConnections(userId: string): Promise<unknown[]>;
  revokeConnection(connectionId: string, userId: string): Promise<boolean>;
}

/**
 *   GET  /api/connections                 → { connections, mcpUrl }
 *   POST /api/connections/:id/disconnect  → { ok }
 *
 * The disconnect only accepts a JSON body, which a cross-site form can't send
 * without a CORS preflight this server never answers, so no CSRF token is needed.
 */
export function createConnectionsRouter(session: Session, store: ConnectionStore, publicUrl: string) {
  const router = Router();
  const mcpUrl = new URL("/mcp", publicUrl).toString();

  router.get("/api/connections", session.requireUser, async (_request, response, next) => {
    try {
      response.json({ connections: await store.listConnections(response.locals.userId as string), mcpUrl });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/connections/:id/disconnect", session.requireUser, async (request, response, next) => {
    try {
      if (!request.is("application/json")) {
        response.status(415).json({ error: "json_required" });
        return;
      }
      const ok = await store.revokeConnection(String(request.params.id), response.locals.userId as string);
      response.status(ok ? 200 : 404).json({ ok });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
