import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { listUserOrders, orderView } from "../orders.js";
import { REFUND_REASON_LABELS } from "../refund-types.js";
import { priceWatches } from "../schema.js";
import type { OrderLine } from "../services.js";
import type { AppSession } from "../session.js";

type StatusGroup = "Paid" | "Partially refunded" | "Refunded" | "Pending" | "Cancelled" | "Failed";

function statusGroup(status: string): StatusGroup {
  switch (status) {
    case "COMPLETED":
      return "Paid";
    case "PARTIALLY_REFUNDED":
      return "Partially refunded";
    case "REFUNDED":
      return "Refunded";
    case "CANCELLED":
      return "Cancelled";
    case "FAILED":
      return "Failed";
    default:
      return "Pending";
  }
}

function utcDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function createAnalyticsRouter(db: Database, session: AppSession) {
  const router = Router();
  router.use("/api/analytics", (_request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });
  router.get("/api/analytics", async (request, response, next) => {
    try {
      const userId = session.currentUserId(request);
      if (!userId) {
        response.status(401).json({ error: "not_signed_in" });
        return;
      }
      const [rows, watches] = await Promise.all([
        listUserOrders(db, userId, 500),
        db.select().from(priceWatches).where(eq(priceWatches.userId, userId)),
      ]);
      const orders = rows.map((row) => {
        const items = orderView(row).items;
        const refundedCents = orderView(row).refundedCents;
        return {
          id: row.id,
          date: utcDate(row.createdAt),
          status: row.status,
          statusGroup: statusGroup(row.status),
          currency: row.currency,
          total: row.totalCents / 100,
          refunded: refundedCents / 100,
          net: (row.totalCents - refundedCents) / 100,
          disputed: row.disputeId ? 1 as const : 0 as const,
          disputeStatus: row.disputeStatus ?? null,
          merchant: items[0]?.merchant || "Unknown",
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        };
      });
      const items = rows.flatMap((row) =>
        (row.items as OrderLine[]).map((item) => ({
          orderId: row.id,
          title: item.title,
          merchant: item.merchant || "Unknown",
          quantity: item.quantity,
          unitPrice: item.unitCents / 100,
          lineTotal: (item.unitCents * item.quantity) / 100,
        }))
      );
      const refunds = rows.flatMap((row) =>
        (row.refunds ?? []).map((refund) => ({
          orderId: row.id,
          date: utcDate(refund.createdAt),
          amount: refund.cents / 100,
          reason: refund.reason ? REFUND_REASON_LABELS[refund.reason] : "Not recorded",
        }))
      );
      const watchViews = watches.map((watch) => ({
        id: watch.id,
        title: watch.title,
        startPrice: watch.startCents === null ? null : watch.startCents / 100,
        lastPrice: watch.lastCents === null ? null : watch.lastCents / 100,
        change:
          watch.startCents === null || watch.lastCents === null
            ? null
            : (watch.lastCents - watch.startCents) / 100,
        inStock: watch.lastInStock,
        alert: watch.alert,
        date: utcDate(watch.createdAt),
      }));

      response.json({
        licenseKey: process.env.AGGRID_LICENSE_KEY?.trim() || null,
        orders,
        items,
        refunds,
        watches: watchViews,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
