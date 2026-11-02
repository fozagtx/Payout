import express, { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { Database } from "../../db/client.js";
import { requireMerchant } from "../admin.js";
import {
  OrderError,
  REFUND_REASONS,
  findOrderById,
  listAllOrders,
  orderListView,
  refundOrder,
  requestRefund,
} from "../orders.js";
import type { Services } from "../services.js";
import { orders, products, users } from "../schema.js";
import type { AppSession } from "../session.js";

const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(255).optional(),
});
const declineSchema = z.object({ message: z.string().trim().max(255).optional() });

const optionSchema = z.object({ name: z.string().trim().min(1).max(100), values: z.array(z.string().trim().min(1).max(200)).min(1).max(50) });
const productBody = z.object({
  title: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  imageUrls: z.array(z.url({ protocol: /^https?$/ }).max(2048)).max(12).optional(),
  priceCents: z.number().int().positive(),
  currency: z.string().trim().length(3).optional(),
  compareAtCents: z.number().int().positive().optional(),
  inStock: z.boolean().optional(),
  options: z.array(optionSchema).max(5).optional(),
});
const productPatch = productBody.partial();
const importBody = z.object({
  channel3Id: z.string().min(1).max(512),
  priceCents: z.number().int().positive().optional(),
});

const productView = (row: typeof products.$inferSelect) => ({
  id: row.id,
  title: row.title,
  brand: row.brand,
  description: row.description,
  imageUrls: row.imageUrls,
  priceCents: row.priceCents,
  currency: row.currency,
  compareAtCents: row.compareAtCents,
  inStock: row.inStock,
  options: row.options,
  channel3Id: row.channel3Id,
  supplierName: row.supplierName,
  supplierUrl: row.supplierUrl,
  supplierCents: row.supplierCents,
  createdAt: row.createdAt,
});

function invalid(response: Response, error: z.ZodError) {
  response.status(400).json({ error: "invalid_request", message: error.issues[0]?.message ?? "Invalid request." });
}

export function createMerchantRouter(db: Database, session: AppSession, services: Services) {
  const router = Router();
  router.use("/api/merchant", express.json({ limit: "16kb" }), requireMerchant(db, session));

  router.get("/api/merchant/orders", async (_request, response, next) => {
    try {
      const rows = await db.select({ order: orders, buyer: users.username })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .orderBy(sql`CASE WHEN ${orders.refundRequest}->>'status' = 'pending' THEN 0 ELSE 1 END`, desc(orders.createdAt), desc(orders.id))
        .limit(300);
      response.json({ orders: rows.map(({ order, buyer }) => ({ ...orderListView(order), buyer })) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/merchant/orders/:id/refund", async (request, response, next) => {
    try {
      const row = await findOrderById(db, request.params.id);
      if (!row) {
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) return invalid(response, parsed.error);
      try {
        const updated = await refundOrder(db, services.payments, row, parsed.data);
        if (updated.refundRequest?.status === "pending") {
          await db.update(orders).set({
            refundRequest: { ...updated.refundRequest, status: "approved", decidedAt: new Date().toISOString() },
            updatedAt: new Date(),
          }).where(eq(orders.id, updated.id));
        }
        const [fresh] = await db.select().from(orders).where(eq(orders.id, updated.id));
        response.json({ order: orderListView(fresh ?? updated) });
      } catch (caught) {
        if (!(caught instanceof OrderError)) throw caught;
        response.status(caught.code === "not_refundable" || caught.code === "invalid_amount" ? 409 : 502)
          .json({ error: caught.code, ...caught.toJSON() });
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/merchant/orders/:id/refund-request/decline", async (request, response, next) => {
    try {
      const parsed = declineSchema.safeParse(request.body);
      if (!parsed.success) return invalid(response, parsed.error);
      const [row] = await db.select().from(orders).where(eq(orders.id, request.params.id)).limit(1);
      if (!row?.refundRequest || row.refundRequest.status !== "pending") {
        response.status(404).json({ error: "no_pending_request" });
        return;
      }
      const refundRequest = {
        ...row.refundRequest,
        status: "declined" as const,
        decidedAt: new Date().toISOString(),
        ...(parsed.data.message ? { merchantMessage: parsed.data.message } : {}),
      };
      const [updated] = await db.update(orders).set({ refundRequest, updatedAt: new Date() }).where(eq(orders.id, row.id)).returning();
      response.json({ order: orderListView(updated ?? row) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/merchant/products", async (_request, response, next) => {
    try {
      const rows = await db.select().from(products).orderBy(desc(products.createdAt)).limit(500);
      response.json({ products: rows.map(productView) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/merchant/products", async (request, response, next) => {
    try {
      const parsed = productBody.safeParse(request.body);
      if (!parsed.success) return invalid(response, parsed.error);
      const body = parsed.data;
      const [row] = await db
        .insert(products)
        .values({
          title: body.title,
          brand: body.brand ?? null,
          description: body.description ?? null,
          imageUrls: body.imageUrls ?? [],
          priceCents: body.priceCents,
          currency: (body.currency ?? "USD").toUpperCase(),
          compareAtCents: body.compareAtCents ?? null,
          inStock: body.inStock ?? true,
          options: body.options ?? [],
        })
        .returning();
      response.status(201).json({ product: productView(row!) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/api/merchant/products/:id", async (request, response, next) => {
    try {
      const parsed = productPatch.safeParse(request.body);
      if (!parsed.success) return invalid(response, parsed.error);
      const body = parsed.data;
      const [row] = await db
        .update(products)
        .set({ ...body, ...(body.currency ? { currency: body.currency.toUpperCase() } : {}), updatedAt: new Date() })
        .where(eq(products.id, request.params.id))
        .returning();
      if (!row) {
        response.status(404).json({ error: "product_not_found" });
        return;
      }
      response.json({ product: productView(row) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/merchant/products/:id", async (request, response, next) => {
    try {
      const deleted = await db.delete(products).where(eq(products.id, request.params.id));
      if (!deleted.rowCount) {
        response.status(404).json({ error: "product_not_found" });
        return;
      }
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /** Channel3 sourcing search: results the merchant can import with "Sell this". */
  router.get("/api/merchant/sourcing", async (request, response, next) => {
    try {
      if (!services.storefront) {
        response.status(503).json({ error: "search_not_configured", message: "The product catalog isn't connected yet — set up the catalog API key on this server." });
        return;
      }
      const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 300) : "";
      if (!query) {
        response.json({ products: [] });
        return;
      }
      const page = await services.storefront.search({ query, userId: session.currentUserId(request) ?? undefined });
      response.setHeader("cache-control", "no-store");
      response.json({ products: page.products ?? [] });
    } catch (error) {
      next(error);
    }
  });

  /** Import a Channel3 product into the store, remembering where it's sourced. */
  router.post("/api/merchant/products/import", async (request, response, next) => {
    try {
      if (!services.storefront) {
        response.status(503).json({ error: "search_not_configured", message: "The product catalog isn't connected yet — set up the catalog API key on this server." });
        return;
      }
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) return invalid(response, parsed.error);
      const product = await services.storefront.product(parsed.data.channel3Id, undefined, session.currentUserId(request) ?? undefined);
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "The catalog couldn't find that product." });
        return;
      }
      const best = [...(product.offers ?? [])]
        .filter((offer) => offer.availability === "InStock" && typeof offer.price?.price === "number")
        .sort((a, b) => a.price.price - b.price.price)[0]
        ?? [...(product.offers ?? [])].sort((a, b) => (a.price?.price ?? 0) - (b.price?.price ?? 0))[0];
      const supplierCents = best ? Math.round(best.price.price * 100) : null;
      const compareAt = best?.price?.compare_at_price;
      const [existing] = await db.select().from(products).where(eq(products.channel3Id, parsed.data.channel3Id)).limit(1);
      const values = {
        title: product.title,
        brand: product.brands?.[0]?.name ?? null,
        description: product.description ?? null,
        imageUrls: (product.images ?? []).map((image) => image.cleaned_url ?? image.url).filter((url): url is string => Boolean(url)).slice(0, 12),
        priceCents: parsed.data.priceCents ?? supplierCents ?? 0,
        currency: best?.price?.currency?.toUpperCase() ?? "USD",
        compareAtCents: typeof compareAt === "number" ? Math.round(compareAt * 100) : null,
        inStock: product.offers?.some((offer) => offer.availability === "InStock") ?? true,
        options: (product.variants?.options ?? []).map((option) => ({
          name: option.name,
          values: option.values.filter((value) => value.exists).map((value) => value.label),
        })),
        channel3Id: product.id,
        supplierName: best?.domain ?? null,
        supplierUrl: best?.url ?? null,
        supplierCents,
        updatedAt: new Date(),
      };
      if (!values.priceCents) {
        response.status(409).json({ error: "no_price", message: "That product has no price — set one with priceCents." });
        return;
      }
      const [row] = existing
        ? await db.update(products).set(values).where(eq(products.id, existing.id)).returning()
        : await db.insert(products).values(values).returning();
      response.status(201).json({ product: productView(row!) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/merchant/disputes", async (_request, response, next) => {
    try {
      const [allOrders, disputes] = await Promise.all([db.select().from(orders), services.payments.listDisputes()]);
      const byCaptureId = new Map(allOrders.filter((order) => order.captureId).map((order) => [order.captureId!, order]));
      const matched = disputes.flatMap((dispute) => {
        const order = dispute.captureId ? byCaptureId.get(dispute.captureId) : undefined;
        return order ? [{ ...dispute, orderId: order.id }] : [];
      });
      for (const dispute of matched) {
        await db.update(orders).set({ disputeId: dispute.disputeId, disputeStatus: dispute.status, disputeReason: dispute.reason, updatedAt: new Date() }).where(eq(orders.id, dispute.orderId));
      }
      response.setHeader("cache-control", "no-store");
      response.json({ disputes: matched });
    } catch (error) {
      if (error instanceof Error && error.message === "paypal_not_configured") {
        response.status(503).json({ error: "paypal_not_configured", message: "PayPal isn't configured on this server yet (missing sandbox credentials)." });
        return;
      }
      next(error);
    }
  });

  return router;
}
