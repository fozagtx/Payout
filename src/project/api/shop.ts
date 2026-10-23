import { Router } from "express";
import type { Database } from "../../db/client.js";
import type { Services } from "../services.js";
import type { AppSession } from "../session.js";

/** STUB — replaced by the checkout work. */
export function createShopRouter(_db: Database, _session: AppSession, _services: Services) {
  return Router();
}
