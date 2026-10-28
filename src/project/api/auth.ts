import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { hashPassword, usernameKey, validateCredentials, verifyPassword } from "../../lib/password.js";
import { isMerchant } from "../admin.js";
import { users } from "../schema.js";
import { safeNext, type AppSession } from "../session.js";

// A fixed hash so unknown usernames cost the same scrypt time as wrong passwords.
const DUMMY_HASH = await hashPassword("not-a-real-password");

function credentials(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  return {
    username: String(input.username ?? "").trim().toLowerCase(),
    password: String(input.password ?? ""),
    next: safeNext(input.next === "/" || !input.next ? "/dashboard" : input.next),
  };
}

/**
 *   POST /api/auth/signup   { username, password, next? } → { ok, next }
 *   POST /api/auth/login    { username, password, next? } → { ok, next }
 *   POST /api/auth/logout
 *   GET  /api/me            → { user } | 401
 *   PUT  /api/me/paypal     { email | null } → link the shopper's sandbox PayPal login
 */
export function createAuthRouter(db: Database, session: AppSession) {
  const router = Router();
  router.use("/api", express.json({ limit: "16kb" }));
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

  router.post("/api/auth/signup", limiter, async (request, response, next) => {
    try {
      const { username, password, next: target } = credentials(request.body);
      const problem = validateCredentials(username, password);
      if (problem) {
        response.status(400).json({ error: "invalid_credentials", message: problem });
        return;
      }
      const [user] = await db
        .insert(users)
        .values({ username, usernameKey: usernameKey(username), passwordHash: await hashPassword(password) })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!user) {
        const [existing] = await db
          .select({ id: users.id, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        const valid = await verifyPassword(password, existing?.passwordHash ?? DUMMY_HASH);
        if (existing && valid) {
          session.start(response, existing.id);
          response.status(200).json({ ok: true, next: target });
          return;
        }
        response.status(409).json({
          error: "username_taken",
          message: "That username is taken or too close to an existing one. If it's yours, log in instead.",
        });
        return;
      }
      session.start(response, user.id);
      response.status(201).json({ ok: true, next: target });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/login", limiter, async (request, response, next) => {
    try {
      const { username, password, next: target } = credentials(request.body);
      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user) {
        response.status(401).json({
          error: "unknown_user",
          message: "No account with that username. Create one — it takes a few seconds.",
        });
        return;
      }
      if (!valid) {
        response.status(401).json({ error: "invalid_login", message: "Wrong username or password." });
        return;
      }
      session.start(response, user.id);
      response.json({ ok: true, next: target });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/auth/logout", (_request, response) => {
    session.clear(response);
    response.json({ ok: true });
  });

  router.get("/api/me", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      const [user] = userId
        ? await db
            .select({ id: users.id, username: users.username, paypalEmail: users.paypalEmail, createdAt: users.createdAt })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
        : [];
      if (!user) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      response.json({ user: { ...user, role: isMerchant(user.username) ? "merchant" : "buyer" } });
    } catch (error) {
      next(error);
    }
  });

  router.put("/api/me/paypal", session.requireUser, async (request, response, next) => {
    try {
      const raw = (request.body as Record<string, unknown> | undefined)?.email;
      const email = raw === null || raw === "" ? null : String(raw ?? "").trim().toLowerCase();
      if (email !== null && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
        response.status(400).json({ error: "invalid_email", message: "Enter the email of your PayPal sandbox account." });
        return;
      }
      await db.update(users).set({ paypalEmail: email }).where(eq(users.id, response.locals.userId as string));
      response.json({ ok: true, paypalEmail: email });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
