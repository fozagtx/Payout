import { Router } from "express";
import type { Database } from "../../db/client.js";
import {
  OrderError,
  cancelOrder,
  findOrderById,
  findOrderByPayPalId,
  listUserOrders,
  orderListView,
  publicOrderView,
  syncOrder,
} from "../orders.js";
import type { Services } from "../services.js";
import type { AppSession } from "../session.js";

/**
 *   GET /api/orders               → { orders } for the signed-in user (401 otherwise)
 *   GET /api/orders/:id/public    → { order: { id, status, totalCents, currency, items } }
 *   GET /paypal/return?token=…    PayPal sends the buyer here after approving: capture, then
 *                                 303 → /checkout/complete?order=<id>[&error=<code>]
 *   GET /paypal/cancel?order=<id> → mark CANCELLED, 303 → /checkout/cancelled?order=<id>
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
