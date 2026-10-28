import { Router } from "express";
import type { Database } from "../../db/client.js";
import { requireMerchant } from "../admin.js";
import { listAllOrders, orderView } from "../orders.js";
import { REFUND_REASON_LABELS } from "../refund-types.js";
import { priceWatches } from "../schema.js";
import type { OrderLine, Services, ShippingAddress } from "../services.js";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createAnalyticsRouter(db: Database, session: AppSession, services: Services) {
  const router = Router();
  router.use("/api/analytics", (_request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });
  router.use("/api/analytics", requireMerchant(db, session));

  router.get("/api/analytics", async (request, response, next) => {
    try {
      const rows = await listAllOrders(db, 1000);
      const watches = await db.select().from(priceWatches);
      const orders = rows.map(({ order: row, buyer }) => {
        const items = orderView(row).items;
        const refundedCents = orderView(row).refundedCents;
        const shipping = row.shipping as ShippingAddress | null;
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
          shipCountry: shipping?.countryCode ?? null,
          buyer,
        };
      });
      const items = rows.flatMap(({ order: row }) =>
        (row.items as OrderLine[]).map((item) => ({
          orderId: row.id,
          title: item.title,
          merchant: item.merchant || "Unknown",
          quantity: item.quantity,
          unitPrice: item.unitCents / 100,
          lineTotal: (item.unitCents * item.quantity) / 100,
        }))
      );
      const refunds = rows.flatMap(({ order: row }) =>
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

      let earnings: {
        available: boolean;
        message: string | null;
        clicks: number;
        transactions: { date: string; merchant: string; sale: number; commission: number; status: string }[];
      } = {
        available: false,
        message: "Earnings need CHANNEL3_API_KEY on this server.",
        clicks: 0,
        transactions: [],
      };
      if (services.storefront) {
        try {
          const result = await services.storefront.earnings(undefined, 90);
          earnings = {
            available: true,
            message: null,
            clicks: result.clicks,
            transactions: result.transactions.map((transaction) => ({
              date: utcDate(transaction.date),
              merchant: transaction.merchant,
              sale: transaction.saleAmount,
              commission: transaction.commission,
              status: transaction.status,
            })),
          };
        } catch (error) {
          earnings = { available: false, message: errorMessage(error), clicks: 0, transactions: [] };
        }
      }

      response.json({
        licenseKey: process.env.AGGRID_LICENSE_KEY?.trim() || null,
        orders,
        items,
        refunds,
        watches: watchViews,
        earnings,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
