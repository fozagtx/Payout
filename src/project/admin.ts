import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { users } from "./schema.js";
import type { AppSession } from "./session.js";

export function merchantUsernames() {
  return new Set(
    (process.env.PAYOUT_ADMIN_USERNAMES ?? "")
      .split(",")
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isMerchant(username: string) {
  return merchantUsernames().has(username.trim().toLowerCase());
}

export async function userWithRole(db: Database, userId: string) {
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  return { ...user, role: isMerchant(user.username) ? "merchant" as const : "buyer" as const };
}

export function requireMerchant(db: Database, session: AppSession) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const userId = session.currentUserId(request);
    if (!userId) {
      response.status(401).json({ error: "not_signed_in" });
      return;
    }
    const user = await userWithRole(db, userId);
    if (!user) {
      response.status(401).json({ error: "not_signed_in" });
      return;
    }
    if (user.role !== "merchant") {
      response.status(403).json({ error: "merchant_only", message: "Only the store owner can see this." });
      return;
    }
    response.locals.userId = user.id;
    next();
  };
}
