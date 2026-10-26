import express, { Router } from "express";
import { Webhook } from "svix";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import { isInStock } from "../../lib/format.js";
import { priceWatches, webhookEvents } from "../schema.js";
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

function webhookPayload(body: unknown) {
  const envelope = body as {
    type?: string;
    event_type?: string;
    data?: { object?: Record<string, unknown> } | Record<string, unknown>;
    object?: Record<string, unknown>;
  };
  const data = envelope.data as Record<string, unknown> | undefined;
  const payload = (data?.object ?? data ?? envelope.object ?? envelope) as Record<string, unknown>;
  const offer = (payload.offer ?? payload) as Record<string, unknown>;
  const nestedProduct = (payload.product ?? offer.product) as Record<string, unknown> | undefined;
  const priceValue = offer.price ?? payload.price ?? payload.new_price ?? payload.current_price;
  const price = typeof priceValue === "number"
    ? priceValue
    : typeof priceValue === "object" && priceValue !== null
      ? Number((priceValue as { price?: unknown; amount?: unknown; value?: unknown }).price ??
          (priceValue as { amount?: unknown }).amount ?? (priceValue as { value?: unknown }).value)
      : Number(priceValue);
  const availability = offer.availability ?? offer.in_stock ?? payload.availability ?? payload.in_stock ?? payload.available;
  const inStock = typeof availability === "boolean"
    ? availability
    : typeof availability === "string"
      ? ["in_stock", "instock", "in stock", "available"].includes(availability.toLowerCase())
      : undefined;
  const rawCurrency = offer.currency ?? payload.currency;
  const priceObject = typeof priceValue === "object" && priceValue !== null ? priceValue as { currency?: string; currency_code?: string } : undefined;
  return {
    type: envelope.type ?? envelope.event_type ?? "",
    productId: String(
      payload.canonical_product_id ??
        payload.product_id ??
        offer.canonical_product_id ??
        offer.product_id ??
        nestedProduct?.canonical_product_id ??
        nestedProduct?.id ??
        ""
    ),
    priceCents: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : undefined,
    currency: String(rawCurrency ?? priceObject?.currency ?? priceObject?.currency_code ?? "USD"),
    domain: String(offer.domain ?? payload.domain ?? offer.website ?? payload.website ?? "the store"),
    inStock,
  };
}

export function createWatchesRouter(db: Database, session: AppSession, services: Services, webhookSecret?: string) {
  const router = Router();

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
        const isPrice = update.type === "offer.price.changed";
        const isAvailability = update.type === "offer.availability.changed";
        if (!update.productId || (!isPrice && !isAvailability)) return true;
        const watches = await transaction.select().from(priceWatches).where(eq(priceWatches.productId, update.productId));
        for (const watch of watches) {
          const cents = isPrice ? update.priceCents : undefined;
          const stock = isAvailability ? update.inStock : undefined;
          const priceDropped = cents !== undefined && (watch.lastCents === null || cents < watch.lastCents);
          const priceAlert = priceDropped && (
            watch.targetCents !== null
              ? cents! <= watch.targetCents
              : watch.startCents !== null && cents! < watch.startCents
          );
          const stockAlert = stock === true && watch.lastInStock === false;
          const alert = priceAlert
            ? `Price dropped from ${money(watch.lastCents ?? watch.startCents ?? cents, update.currency)} to ${money(cents, update.currency)} at ${update.domain}`
            : stockAlert
              ? `${watch.title} is back in stock at ${update.domain}`
              : undefined;
          await transaction
            .update(priceWatches)
            .set({
              ...(cents !== undefined ? { lastCents: cents, currency: update.currency } : {}),
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
      const { productId, targetPrice } = parsed.data;
      const [existing] = await db
        .select()
        .from(priceWatches)
        .where(and(eq(priceWatches.userId, userId), eq(priceWatches.productId, productId)))
        .limit(1);
      if (existing) {
        response.json({ watch: existing });
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
      const alreadyTracked = await db.select({ id: priceWatches.id }).from(priceWatches).where(eq(priceWatches.productId, productId)).limit(1);
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
        response.json({ watch: concurrent });
        return;
      }
      if (!alreadyTracked.length) {
        try {
          await storefront.startTracking(productId);
        } catch (error) {
          await db.delete(priceWatches).where(eq(priceWatches.id, watch.id));
          throw error;
        }
      }
      response.status(201).json({ watch });
    } catch (error) {
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
      if (!others.length) await services.storefront.stopTracking(watch.productId);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/earnings", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const rawDays = request.query.days === undefined ? "30" : String(request.query.days);
      const days = Number(rawDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        response.status(400).json({ error: "invalid_request", message: "days must be a whole number from 1 to 90." });
        return;
      }
      if (!services.storefront) {
        response.status(503).json({ error: "search_not_configured", message: "Earnings reporting needs CHANNEL3_API_KEY on this server." });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json(await services.storefront.earnings(userId, days));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
