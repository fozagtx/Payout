import express, { Router } from "express";
import { Webhook } from "svix";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import { isInStock } from "../../lib/format.js";
import { Channel3ProductProcessingError } from "../channel3/storefront.js";
import { requireMerchant } from "../admin.js";
import { orders, priceWatches, webhookEvents } from "../schema.js";
import { getStoreProduct } from "../store/catalog.js";
import type { Services } from "../services.js";
import type { AppSession } from "../session.js";

const watchInput = z.object({
  productId: z.string().min(1).max(512),
  targetPrice: z.number().positive().max(1_000_000).optional(),
});

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type WatchUpdate = {
  type: "offer.price.changed" | "offer.availability.changed" | "price.changed";
  productId: string;
  domain: string;
  priceCents?: number;
  currency?: string;
  inStock?: boolean;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function webhookPayload(body: unknown): WatchUpdate | undefined {
  const envelope = record(body);
  if (!envelope || typeof envelope.type !== "string") return undefined;

  if (envelope.type === "offer.price.changed") {
    const data = record(envelope.data);
    const subject = record(data?.subject);
    const current = record(data?.current);
    const productId = subject?.product_id;
    const domain = subject?.domain;
    const price = current?.price;
    const currency = current?.currency;
    if (
      typeof productId !== "string" || !productId ||
      typeof domain !== "string" || !domain ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 ||
      typeof currency !== "string" || !currency
    ) return undefined;
    return { type: envelope.type, productId, domain, priceCents: Math.round(price * 100), currency };
  }

  if (envelope.type === "offer.availability.changed") {
    const data = record(envelope.data);
    const subject = record(data?.subject);
    const productId = subject?.product_id;
    const domain = subject?.domain;
    if (
      typeof productId !== "string" || !productId ||
      typeof domain !== "string" || !domain ||
      (data?.current !== "InStock" && data?.current !== "OutOfStock")
    ) return undefined;
    return { type: envelope.type, productId, domain, inStock: data.current === "InStock" };
  }

  if (envelope.type === "price.changed") {
    const productId = envelope.canonical_product_id;
    const domain = envelope.domain;
    const price = envelope.new_price;
    const currency = envelope.currency;
    if (
      typeof productId !== "string" || !productId ||
      typeof domain !== "string" || !domain ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 ||
      typeof currency !== "string" || !currency
    ) return undefined;
    return { type: envelope.type, productId, domain, priceCents: Math.round(price * 100), currency };
  }

  return undefined;
}

export function createWatchesRouter(db: Database, session: AppSession, services: Services, webhookSecret?: string) {
  const router = Router();
  router.use("/api/earnings", requireMerchant(db, session));

  router.post("/channel3/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (request, response) => {
    if (!webhookSecret) {
      response.status(503).json({ error: "channel3_webhook_not_configured", message: "Channel3 webhook signing isn't configured on this server." });
      return;
    }
    const id = request.header("svix-id");
    const timestamp = request.header("svix-timestamp");
    const signature = request.header("svix-signature");
    if (!Buffer.isBuffer(request.body) || !id || !timestamp || !signature) {
      response.status(400).json({ error: "invalid_webhook" });
      return;
    }
    let event: unknown;
    try {
      new Webhook(webhookSecret).verify(request.body, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      });
      event = JSON.parse(request.body.toString("utf8"));
    } catch {
      response.status(400).json({ error: "invalid_webhook" });
      return;
    }

    try {
      const update = webhookPayload(event);
      const inserted = await db.transaction(async (transaction) => {
        const created = await transaction
          .insert(webhookEvents)
          .values({ id })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id });
        if (!created.length) return false;
        if (!update) return true;
        const isPrice = update.type === "offer.price.changed" || update.type === "price.changed";
        const isAvailability = update.type === "offer.availability.changed";
        const watches = await transaction.select().from(priceWatches).where(eq(priceWatches.productId, update.productId));
        for (const watch of watches) {
          const cents = isPrice ? update.priceCents : undefined;
          const stock = isAvailability ? update.inStock : undefined;
          const currency = update.currency ?? watch.currency;
          const priceDropped = cents !== undefined && (watch.lastCents === null || cents < watch.lastCents);
          const priceAlert = priceDropped && (
            watch.targetCents !== null
              ? cents! <= watch.targetCents
              : watch.startCents !== null && cents! < watch.startCents
          );
          const stockAlert = stock === true && watch.lastInStock === false;
          const alert = priceAlert
            ? `Price dropped from ${money(watch.lastCents ?? watch.startCents ?? cents, currency)} to ${money(cents, currency)} at ${update.domain}`
            : stockAlert
              ? `${watch.title} is back in stock at ${update.domain}`
              : undefined;
          await transaction
            .update(priceWatches)
            .set({
              ...(cents !== undefined ? { lastCents: cents, currency } : {}),
              ...(stock !== undefined ? { lastInStock: stock } : {}),
              ...(alert ? { alert, alertedAt: new Date() } : {}),
            })
            .where(eq(priceWatches.id, watch.id));
        }
        return true;
      });
      response.json({ ok: true, duplicate: !inserted });
    } catch (error) {
      console.error("Channel3 webhook", error instanceof Error ? error.message : error);
      response.status(500).json({ error: "webhook_processing_failed" });
    }
  });

  router.use("/api/watches", express.json({ limit: "16kb" }));

  router.get("/api/watches", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const watches = await db.select().from(priceWatches).where(eq(priceWatches.userId, userId));
      response.setHeader("cache-control", "no-store");
      response.json({ watches });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/watches", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const parsed = watchInput.safeParse(request.body ?? {});
      if (!parsed.success) {
        response.status(400).json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid request." });
        return;
      }
      const storefront = services.storefront;
      if (!storefront) {
        response.status(503).json({ error: "search_not_configured", message: "Product watches need CHANNEL3_API_KEY on this server." });
        return;
      }
      // The shop sends the store's product id; price watches key on the Channel3 id it was imported from.
      let { productId, targetPrice } = parsed.data;
      const row = await getStoreProduct(db, productId);
      if (row) {
        if (!row.channel3Id) {
          response.status(409).json({ error: "watch_not_available", message: "Price watching isn't available for this product — the merchant sets the price." });
          return;
        }
        productId = row.channel3Id;
      }
      const [existing] = await db
        .select()
        .from(priceWatches)
        .where(and(eq(priceWatches.userId, userId), eq(priceWatches.productId, productId)))
        .limit(1);
      if (existing) {
        const subscriptionId = await storefront.subscribe(productId);
        const [watch] = await db.update(priceWatches).set({ subscriptionId }).where(eq(priceWatches.id, existing.id)).returning();
        response.json({ watch: watch ?? { ...existing, subscriptionId } });
        return;
      }
      const product = await storefront.product(productId, undefined, userId);
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "Channel3 doesn't have this product any more." });
        return;
      }
      const bestOffer = [...(product.offers ?? [])]
        .filter((offer) => isInStock(offer.availability))
        .sort((left, right) => left.price.price - right.price.price)[0];
      const startCents = bestOffer ? Math.round(bestOffer.price.price * 100) : null;
      const currency = bestOffer?.price.currency.toUpperCase() ?? "USD";
      const [watch] = await db
        .insert(priceWatches)
        .values({
          userId,
          productId,
          title: product.title,
          imageUrl: product.images?.[0]?.cleaned_url ?? product.images?.[0]?.url ?? null,
          currency,
          targetCents: targetPrice === undefined ? null : Math.round(targetPrice * 100),
          startCents,
          lastCents: startCents,
          lastInStock: Boolean(bestOffer),
        })
        .onConflictDoNothing()
        .returning();
      if (!watch) {
        const [concurrent] = await db
          .select()
          .from(priceWatches)
          .where(and(eq(priceWatches.userId, userId), eq(priceWatches.productId, productId)))
          .limit(1);
        if (!concurrent) throw new Error("Price watch was not created");
        const subscriptionId = await storefront.subscribe(productId);
        const [updated] = await db.update(priceWatches).set({ subscriptionId }).where(eq(priceWatches.id, concurrent.id)).returning();
        response.json({ watch: updated ?? { ...concurrent, subscriptionId } });
        return;
      }
      try {
        const subscriptionId = await storefront.subscribe(productId);
        const [subscribed] = await db
          .update(priceWatches)
          .set({ subscriptionId })
          .where(eq(priceWatches.id, watch.id))
          .returning();
        response.status(201).json({ watch: subscribed ?? { ...watch, subscriptionId } });
      } catch (error) {
        await db.delete(priceWatches).where(eq(priceWatches.id, watch.id));
        throw error;
      }
    } catch (error) {
      if (error instanceof Channel3ProductProcessingError) {
        response.status(409).json({ error: "product_processing", message: error.message });
        return;
      }
      next(error);
    }
  });

  router.delete("/api/watches/:id", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const [watch] = await db
        .select()
        .from(priceWatches)
        .where(and(eq(priceWatches.id, String(request.params.id)), eq(priceWatches.userId, userId)))
        .limit(1);
      if (!watch) {
        response.status(404).json({ error: "watch_not_found" });
        return;
      }
      if (!services.storefront) {
        response.status(503).json({ error: "search_not_configured", message: "Product watches need CHANNEL3_API_KEY on this server." });
        return;
      }
      await db.delete(priceWatches).where(eq(priceWatches.id, watch.id));
      const others = await db.select({ id: priceWatches.id }).from(priceWatches).where(eq(priceWatches.productId, watch.productId)).limit(1);
      if (!others.length && watch.subscriptionId) await services.storefront.unsubscribe(watch.subscriptionId);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/earnings", async (request, response, next) => {
    try {
      const userId = response.locals.userId as string;
      const rawDays = request.query.days === undefined ? "30" : String(request.query.days);
      const days = Number(rawDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        response.status(400).json({ error: "invalid_request", message: "days must be a whole number from 1 to 90." });
        return;
      }
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ status: orders.status, totalCents: orders.totalCents, currency: orders.currency, refunds: orders.refunds })
        .from(orders)
        .where(sql`${orders.createdAt} >= ${since}`);
      const paid = rows.filter((row) => ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(row.status));
      const grossCents = paid.reduce((sum, row) => sum + row.totalCents, 0);
      const refundedCents = paid.reduce((sum, row) => sum + (row.refunds ?? []).reduce((s, refund) => s + refund.cents, 0), 0);
      const revenue = {
        orders: paid.length,
        currency: paid[0]?.currency ?? "USD",
        grossCents,
        refundedCents,
        netCents: grossCents - refundedCents,
      };
      const channel3 = services.storefront
        ? await services.storefront.earnings(undefined, days).catch(() => null)
        : null;
      response.setHeader("cache-control", "no-store");
      response.json({ revenue, channel3 });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
