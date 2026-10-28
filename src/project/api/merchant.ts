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
import { orders, users } from "../schema.js";
import type { AppSession } from "../session.js";

const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(255).optional(),
});
const declineSchema = z.object({ message: z.string().trim().max(255).optional() });

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
