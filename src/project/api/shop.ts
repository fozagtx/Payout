import express, { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import type { Database } from "../../db/client.js";
import { centsFromPayPal } from "../paypal/client.js";
import {
  OrderError,
  REFUND_REASONS,
  cancelOrder,
  findOrderByCaptureId,
  findOrderById,
  findOrderByPayPalId,
  findUserOrder,
  listUserOrders,
  orderListView,
  publicOrderView,
  recordRefund,
  remainingRefundCents,
  refundOrder,
  syncOrder,
} from "../orders.js";
import type { Services } from "../services.js";
import { orders } from "../schema.js";
import type { AppSession } from "../session.js";

const refundRequestSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(255).optional(),
});

/**
 *   GET /api/orders               → { orders } for the signed-in user (401 otherwise)
 *   GET /api/orders/:id/public    → { order: { id, status, totalCents, currency, items } }
 *   GET /paypal/return?token=…    PayPal sends the buyer here after approving: capture, then
 *                                 303 → /checkout/complete?order=<id>[&error=<code>]
 *   GET /paypal/cancel?order=<id> → mark CANCELLED, 303 → /checkout/cancelled?order=<id>
 *   POST /api/orders/:id/refund   → { order } full or partial refund of the signed-in user's paid order
 *   POST /paypal/webhook          PayPal events (signature verified with PayPal): approvals are
 *                                 captured, captures and refunds update the order on their own
 *
 * The PayPal routes and the public status need no session: the buyer may come
 * back in a tab without our cookie. The PayPal token only lets someone finish
 * a payment its buyer already approved, and order ids are random uuids.
 */
export function createShopRouter(db: Database, session: AppSession, services: Services) {
  const router = Router();

  router.get("/api/orders", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const rows = await listUserOrders(db, userId, 50);
      response.json({ orders: rows.map(orderListView) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/disputes", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const [userOrders, disputes] = await Promise.all([
        db.select().from(orders).where(eq(orders.userId, userId)),
        services.payments.listDisputes(),
      ]);
      const byCaptureId = new Map(userOrders.filter((order) => order.captureId).map((order) => [order.captureId!, order]));
      const matched = disputes.flatMap((dispute) => {
        const order = dispute.captureId ? byCaptureId.get(dispute.captureId) : undefined;
        if (!order) return [];
        return [{ ...dispute, orderId: order.id }];
      });
      for (const dispute of matched) {
        await db
          .update(orders)
          .set({ disputeId: dispute.disputeId, disputeStatus: dispute.status, disputeReason: dispute.reason, updatedAt: new Date() })
          .where(eq(orders.id, dispute.orderId));
      }
      response.setHeader("cache-control", "no-store");
      response.json({ disputes: matched });
    } catch (error) {
      if (error instanceof Error && error.message === "paypal_not_configured") {
        response.status(503).json({
          error: "paypal_not_configured",
          message: "PayPal isn't configured on this server yet (missing sandbox credentials).",
        });
        return;
      }
      next(error);
    }
  });

  router.post("/api/orders/:id/refund", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const row = await findUserOrder(db, userId, request.params.id);
      if (!row) {
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      const parsed = refundRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: "invalid_request",
          message: parsed.error.issues[0]?.message ?? "Invalid refund request.",
        });
        return;
      }
      try {
        response.json({
          order: orderListView(
            await refundOrder(db, services.payments, row, {
              amountCents: parsed.data.amountCents,
              reason: parsed.data.reason,
              note: parsed.data.note || undefined,
            })
          ),
        });
      } catch (caught) {
        if (!(caught instanceof OrderError)) throw caught;
        response
          .status(caught.code === "not_refundable" || caught.code === "invalid_amount" ? 409 : 502)
          .json({ error: caught.code, ...caught.toJSON() });
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/paypal/webhook", express.json({ limit: "256kb" }), async (request, response, next) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const name of ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"]) {
        const value = request.headers[name];
        headers[name] = typeof value === "string" ? value : undefined;
      }
      const event = (request.body ?? {}) as {
        event_type?: string;
        resource?: {
          id?: string;
          amount?: { value?: string };
          note_to_payer?: string;
          dispute_id?: string;
          reason?: string;
          status?: string;
          disputed_transactions?: { seller_transaction_id?: string }[];
          supplementary_data?: { related_ids?: { order_id?: string } };
          links?: { rel?: string; href?: string }[];
        };
      };
      if (!(await services.payments.verifyWebhook({ headers, event }))) {
        response.status(400).json({ error: "invalid_webhook" });
        return;
      }
      const resource = event.resource ?? {};
      switch (event.event_type) {
        case "CHECKOUT.ORDER.APPROVED":
        case "PAYMENT.CAPTURE.COMPLETED":
        case "PAYMENT.CAPTURE.DENIED": {
          const paypalOrderId = event.event_type === "CHECKOUT.ORDER.APPROVED" ? resource.id : resource.supplementary_data?.related_ids?.order_id;
          const row = paypalOrderId ? await findOrderByPayPalId(db, paypalOrderId) : undefined;
          if (row) await syncOrder(db, services.payments, row).catch((error: unknown) => console.error("webhook sync", error));
          break;
        }
        case "PAYMENT.CAPTURE.REFUNDED": {
          const up = resource.links?.find((link) => link.rel === "up")?.href ?? "";
          const captureId = /\/captures\/([^/?#]+)/.exec(up)?.[1];
          const row = captureId ? await findOrderByCaptureId(db, decodeURIComponent(captureId)) : undefined;
          if (row && resource.id) {
            await recordRefund(db, row.id, {
              id: resource.id,
              cents: resource.amount?.value === undefined ? remainingRefundCents(row) : centsFromPayPal(resource.amount.value),
              reason: null,
              note: resource.note_to_payer ?? null,
            });
          }
          break;
        }
        case "CUSTOMER.DISPUTE.CREATED":
        case "CUSTOMER.DISPUTE.UPDATED":
        case "CUSTOMER.DISPUTE.RESOLVED": {
          const captureId = resource.disputed_transactions?.[0]?.seller_transaction_id;
          const row = captureId ? await findOrderByCaptureId(db, captureId) : undefined;
          if (row) {
            await db
              .update(orders)
              .set({
                disputeId: resource.dispute_id ?? resource.id ?? null,
                disputeStatus: resource.status ?? event.event_type.split(".").at(-1) ?? "UNKNOWN",
                disputeReason: resource.reason ?? null,
                updatedAt: new Date(),
              })
              .where(eq(orders.id, row.id));
          }
          break;
        }
      }
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/orders/:id/public", async (request, response, next) => {
    try {
      const row = await findOrderById(db, request.params.id);
      if (!row) {
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({ order: publicOrderView(row) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/paypal/return", async (request, response, next) => {
    try {
      const token = typeof request.query.token === "string" ? request.query.token : "";
      const row = token ? await findOrderByPayPalId(db, token) : undefined;
      if (!row) {
        response.redirect(303, "/checkout/complete?error=order_not_found");
        return;
      }
      const done = `/checkout/complete?order=${row.id}`;
      try {
        const synced = await syncOrder(db, services.payments, row, { reopenCancelled: true });
        const error = synced.status === "COMPLETED" ? undefined : synced.status === "CANCELLED" ? "cancelled" : "not_approved";
        response.redirect(303, error ? `${done}&error=${error}` : done);
      } catch (caught) {
        if (!(caught instanceof OrderError)) throw caught;
        response.redirect(303, `${done}&error=${caught.code}`);
      }
    } catch (error) {
      next(error);
    }
  });

  router.get("/paypal/cancel", async (request, response, next) => {
    try {
      const orderId = typeof request.query.order === "string" ? request.query.order : "";
      const row = await cancelOrder(db, orderId);
      response.redirect(303, row ? `/checkout/cancelled?order=${row.id}` : "/checkout/cancelled");
    } catch (error) {
      next(error);
    }
  });

  return router;
}
