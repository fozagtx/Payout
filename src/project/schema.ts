import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Shoppers. Signed in with username + password; the kit's connections point here. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("orders_user_id_idx").on(table.userId)]
);
