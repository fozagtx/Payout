import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { RefundEntry, RefundRequest } from "./refund-types.js";

/** Shoppers. Signed in with username + password; the kit's connections point here. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  usernameKey: text("username_key"),
  passwordHash: text("password_hash").notNull(),
  /** Sandbox PayPal login the shopper linked in the dashboard; pre-fills checkout. */
  paypalEmail: text("paypal_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A PayPal checkout started from an AI chat. `items` is a snapshot of the
 * Channel3 products and prices at the moment the order was created, so the
 * amount the user approves never changes under them.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id"),
    /** Null while status is CREATING (row is written before PayPal is called). */
    paypalOrderId: text("paypal_order_id").unique(),
    status: text("status").notNull(),
    currency: text("currency").notNull(),
    totalCents: integer("total_cents").notNull(),
    items: jsonb("items").notNull(),
    approveUrl: text("approve_url"),
    captureId: text("capture_id"),
    /** Where the buyer asked PayPal to ship; copied from the order once approved. */
    shipping: jsonb("shipping"),
    refundId: text("refund_id"),
    refunds: jsonb("refunds").$type<RefundEntry[]>().notNull().default([]),
    refundRequest: jsonb("refund_request").$type<RefundRequest | null>(),
    disputeId: text("dispute_id"),
    disputeStatus: text("dispute_status"),
    disputeReason: text("dispute_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("orders_user_id_idx").on(table.userId)]
);

export const priceWatches = pgTable(
  "price_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    subscriptionId: text("subscription_id"),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    currency: text("currency").notNull().default("USD"),
    targetCents: integer("target_cents"),
    startCents: integer("start_cents"),
    lastCents: integer("last_cents"),
    lastInStock: boolean("last_in_stock"),
    alert: text("alert"),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("price_watches_product_id_idx").on(table.productId),
    index("price_watches_user_id_idx").on(table.userId),
    unique("price_watches_user_product_unique").on(table.userId, table.productId),
  ]
);

export interface StoreOption {
  name: string;
  values: string[];
}

/**
 * The merchant's own catalog: what the store actually sells. Rows are added
 * by hand or imported from Channel3 — `channel3Id`/`supplier*` record where a
 * product was sourced so price history and restock can still come from
 * Channel3 while the sale is the merchant's own.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    brand: text("brand"),
    description: text("description"),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    compareAtCents: integer("compare_at_cents"),
    inStock: boolean("in_stock").notNull().default(true),
    options: jsonb("options").$type<StoreOption[]>().notNull().default([]),
    channel3Id: text("channel3_id"),
    supplierName: text("supplier_name"),
    supplierUrl: text("supplier_url"),
    supplierCents: integer("supplier_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_channel3_id_idx").on(table.channel3Id)]
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
