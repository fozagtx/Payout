import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "../../db/client.js";
import type { Services } from "../services.js";
import { registerAccountTools } from "./account.js";
import { registerCatalogTools } from "./catalog.js";
import { registerCheckoutTools } from "./checkout.js";

/**
 * Every tool follows the same three steps:
 *   1. toolContext(db, extra.authInfo, "<scope>") → who, and allowed?
 *   2. do the work, always filtered by context.userId
 *   3. logTool(...) and return result(...)
 *
 * Write descriptions for the model: say what the tool does, when to use it,
 * and what each argument means. That text is how the AI picks tools.
 */
export function createRegisterTools(services: Services) {
  return function registerTools(server: McpServer, db: Database) {
    registerAccountTools(server, db);
    registerCatalogTools(server, db, services);
    registerCheckoutTools(server, db, services);
  };
}
