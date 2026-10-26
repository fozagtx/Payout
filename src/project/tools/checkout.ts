import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { Database } from "../../db/client.js";
import { logTool, result } from "../../mcp-kit/index.js";
import {
  MAX_QUANTITY,
  OrderError,
  createCheckout,
  findUserOrder,
  listUserOrders,
  orderListView,
  orderView,
  syncOrder,
  type OrderView,
} from "../orders.js";
import { formatCents } from "../paypal/client.js";
import type { Services } from "../services.js";
import { SHOP_WIDGET_URI } from "../ui/resource.js";
import { toolContext } from "./context.js";

const widgetMeta = { ui: { resourceUri: SHOP_WIDGET_URI }, "ui/resourceUri": SHOP_WIDGET_URI };

const money = (cents: number, currency: string) => `${formatCents(cents)} ${currency}`;

/** Order result: a sentence for the model, `{ order }` for the canvas. */
function orderResult(order: OrderView, text: string) {
  const structuredContent = { order } as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: `${text}\n\n${JSON.stringify(structuredContent)}` }],
    structuredContent,
  };
}

function statusText(order: OrderView) {
  const total = money(order.totalCents, order.currency);
  switch (order.status) {
    case "COMPLETED":
      return `Payment completed: ${total} was captured through PayPal.`;
    case "CANCELLED":
      return "The buyer cancelled this checkout on PayPal. No money moved.";
    case "FAILED":
      return "This checkout failed to start on PayPal. No money moved; you can create a new checkout.";
    case "APPROVED":
      return `The buyer approved ${total} on PayPal; the payment is being captured. Check again shortly.`;
    default:
      return `Waiting for the user to approve ${total} on PayPal${order.approveUrl ? ` at ${order.approveUrl}` : ""}. No money has moved yet.`;
  }
}

export function registerCheckoutTools(server: McpServer, db: Database, services: Services) {
  server.registerTool(
    "create_checkout",
    {
      title: "Create PayPal checkout",
      description:
        "Start a PayPal checkout for products the user chose (ideally picked in the product canvas from search_products). " +
        "Before calling this, confirm the exact items, quantities and total with the user and get their go-ahead. " +
        "Pass only product ids and quantities: prices are always re-read from the catalog, never taken from you. " +
        "Returns an order with an approveUrl. Give the user that link: they log in to PayPal and approve the payment there. " +
        "No money moves until they approve. Afterwards use get_order_status to confirm the payment.",
      inputSchema: {
        items: z
          .array(
            z.object({
              product_id: z.string().min(1).max(512).describe("Product id from search_products."),
              quantity: z.number().int().min(1).max(MAX_QUANTITY).describe(`How many, 1 to ${MAX_QUANTITY}.`),
              options: z
                .record(z.string().min(1).max(100), z.string().min(1).max(200))
                .optional()
                .describe("Size/colour chosen with get_product_details, e.g. {\"Size\": \"10\"}. Prices that exact variant."),
            })
          )
          .min(1)
          .max(10)
          .describe("The products to buy, 1 to 10 lines."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: widgetMeta,
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "shop:checkout");
      if (error) return result(error, true);
      try {
        const row = await createCheckout(db, services, {
          userId: context.userId,
          connectionId: context.connectionId,
          items: args.items,
        });
        await logTool(db, context.connectionId, "create_checkout", args, "allowed");
        const order = orderView(row);
        return orderResult(
          order,
          `Checkout created for ${money(order.totalCents, order.currency)}. Give the user this PayPal link to review and approve the payment: ${order.approveUrl}\n` +
            "Money only moves after they approve on PayPal. Then call get_order_status with the order id to confirm."
        );
      } catch (caught) {
        if (!(caught instanceof OrderError)) throw caught;
        const paypalFailure = caught.code === "paypal_error" || caught.code === "paypal_not_configured";
        await logTool(db, context.connectionId, "create_checkout", args, paypalFailure ? "error" : "rejected", caught.code);
        return result(caught.toJSON(), true);
      }
    }
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Order status",
      description:
        "Check one of the user's orders, e.g. after they say they approved the payment on PayPal. " +
        "If PayPal reports the payment approved, this captures it (completes the payment) and returns the updated order.",
      inputSchema: { order_id: z.uuid().describe("The order id returned by create_checkout or list_orders.") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: widgetMeta,
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "orders:read");
      if (error) return result(error, true);
      const row = await findUserOrder(db, context.userId, args.order_id);
      if (!row) {
        await logTool(db, context.connectionId, "get_order_status", args, "rejected", "order_not_found");
        return result({ code: "order_not_found", message: "No order with that id for this account." }, true);
      }
      try {
        const order = orderView(await syncOrder(db, services.payments, row));
        await logTool(db, context.connectionId, "get_order_status", args, "allowed");
        return orderResult(order, statusText(order));
      } catch (caught) {
        if (!(caught instanceof OrderError)) throw caught;
        await logTool(db, context.connectionId, "get_order_status", args, "error", caught.code);
        return result(caught.toJSON(), true);
      }
    }
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description: "List the user's recent PayPal checkouts, newest first, with their status, items and totals (in cents).",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10).describe("How many orders, 1 to 50.") },
      annotations: { readOnlyHint: true },
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "orders:read");
      if (error) return result(error, true);
      const rows = await listUserOrders(db, context.userId, args.limit);
      await logTool(db, context.connectionId, "list_orders", args, "allowed");
      return result({ orders: rows.map(orderListView) });
    }
  );
}
