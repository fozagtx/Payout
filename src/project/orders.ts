import { and, desc, eq, notInArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { PayPalApiError } from "./paypal/client.js";
import { orders, users } from "./schema.js";
import type { Catalog, OrderLine, PaymentOrder, Payments, SelectedOptions, Services } from "./services.js";

/**
 * Order logic shared by the MCP tools and the HTTP routes: building an order
 * from trusted catalog prices, starting the PayPal checkout, and syncing /
 * capturing it once the buyer approved.
 */

export type OrderStatus = "CREATING" | "PAYER_ACTION_REQUIRED" | "CREATED" | "APPROVED" | "COMPLETED" | "REFUNDED" | "CANCELLED" | "FAILED";

export const FINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED", "FAILED"];

/** PayPal sandbox and the PayPal toolkit work in USD; so do we. */
export const SUPPORTED_CURRENCY = "USD";
export const MAX_QUANTITY = 10;

export type OrderRow = typeof orders.$inferSelect;

/** The order shape tools return and the canvas renders. */
export interface OrderView {
  id: string;
  paypalOrderId: string | null;
  status: string;
  approveUrl: string | null;
  totalCents: number;
  currency: string;
  items: OrderLine[];
}

export function orderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    paypalOrderId: row.paypalOrderId,
    status: row.status,
    approveUrl: row.approveUrl,
    totalCents: row.totalCents,
    currency: row.currency,
    items: row.items as OrderLine[],
  };
}

/** The signed-in owner's view: also where PayPal will ship. */
export const orderListView = (row: OrderRow) => ({
  ...orderView(row),
  shipping: (row.shipping as Record<string, string> | null) ?? null,
  dispute: row.disputeId
    ? { id: row.disputeId, status: row.disputeStatus, reason: row.disputeReason }
    : null,
  createdAt: row.createdAt.toISOString(),
});

/** What the public completion page may see: no PayPal ids or links. */
export const publicOrderView = (row: OrderRow) => ({
  id: row.id,
  status: row.status,
  totalCents: row.totalCents,
  currency: row.currency,
  items: row.items as OrderLine[],
});

export const isFinal = (status: string) => (FINAL_STATUSES as readonly string[]).includes(status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** A refusal the caller can show as is: `{ code, message, ...extra }`. */
export class OrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "OrderError";
  }
  toJSON() {
    return { code: this.code, message: this.message, ...this.extra };
  }
}

/** Maps a payments failure to `paypal_not_configured` or `paypal_error`. */
export function paymentsError(error: unknown) {
  if (error instanceof Error && error.message === "paypal_not_configured") {
    return new OrderError("paypal_not_configured", "PayPal isn't configured on this server yet (missing sandbox credentials).");
  }
  const detail = error instanceof PayPalApiError ? (error.issue ?? error.paypalName ?? String(error.status)) : undefined;
  return new OrderError("paypal_error", `PayPal refused the request${detail ? ` (${detail})` : ""}. Try again in a moment.`, {
    ...(detail ? { paypal_issue: detail } : {}),
  });
}

/**
 * Turns the requested product ids into order lines using the catalog's
 * current prices only. Duplicate ids are merged.
 */
export type CheckoutItem = { product_id: string; quantity: number; options?: SelectedOptions };

const optionsKey = (options: SelectedOptions = {}) => JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));

export async function priceItems(catalog: Catalog, items: CheckoutItem[]) {
  const merged = new Map<string, { productId: string; options?: SelectedOptions; quantity: number }>();
  for (const item of items) {
    const key = `${item.product_id}\u0000${optionsKey(item.options)}`;
    const existing = merged.get(key);
    const options = item.options && Object.keys(item.options).length ? item.options : undefined;
    merged.set(key, { productId: item.product_id, ...(options ? { options } : {}), quantity: (existing?.quantity ?? 0) + item.quantity });
  }

  const lines: OrderLine[] = [];
  for (const { productId, options, quantity } of merged.values()) {
    if (quantity > MAX_QUANTITY) {
      throw new OrderError("invalid_quantity", `At most ${MAX_QUANTITY} of one product per order.`, { product_id: productId });
    }
    const product = options ? await catalog.get(productId, options) : await catalog.get(productId);
    if (!product) throw new OrderError("product_not_found", `No product with id ${productId}. Search again and use an id from the results.`, { product_id: productId });
    if (!product.inStock) throw new OrderError("out_of_stock", `${product.title} is out of stock.`, { product_id: productId });
    if (product.currency.toUpperCase() !== SUPPORTED_CURRENCY) {
      throw new OrderError("unsupported_currency", `${product.title} is priced in ${product.currency}; checkout supports ${SUPPORTED_CURRENCY} only.`, { product_id: productId });
    }
    if (!Number.isSafeInteger(product.priceCents) || product.priceCents <= 0) {
      throw new OrderError("price_unavailable", `${product.title} has no valid price right now.`, { product_id: productId });
    }
    lines.push({
      productId,
      title: options ? `${product.title} (${Object.values(options).join(" / ")})` : product.title,
      quantity,
      unitCents: product.priceCents,
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      ...(product.merchant ? { merchant: product.merchant } : {}),
      ...(options ? { options } : {}),
    });
  }
  const totalCents = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  return { lines, totalCents };
}

async function updateOrder(db: Database, id: string, values: Partial<typeof orders.$inferInsert>) {
  const [row] = await db
    .update(orders)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  return row!;
}

/** Writes the order (CREATING), starts the PayPal checkout, stores the result. Throws OrderError. */
export async function createCheckout(
  db: Database,
  services: Services,
  input: { userId: string; connectionId: string | null; items: CheckoutItem[] }
) {
  const { lines, totalCents } = await priceItems(services.catalog, input.items);
  const [user] = await db.select({ paypalEmail: users.paypalEmail }).from(users).where(eq(users.id, input.userId)).limit(1);
  const [row] = await db
    .insert(orders)
    .values({
      userId: input.userId,
      connectionId: input.connectionId,
      status: "CREATING",
      currency: SUPPORTED_CURRENCY,
      totalCents,
      items: lines,
    })
    .returning();

  let payment: PaymentOrder;
  try {
    payment = await services.payments.createOrder({
      referenceId: row!.id,
      currency: SUPPORTED_CURRENCY,
      lines,
      returnUrl: `${services.publicUrl}/paypal/return`,
      cancelUrl: `${services.publicUrl}/paypal/cancel?order=${row!.id}`,
      ...(user?.paypalEmail ? { payerEmail: user.paypalEmail } : {}),
    });
  } catch (error) {
    await updateOrder(db, row!.id, { status: "FAILED" });
    throw paymentsError(error);
  }
  return updateOrder(db, row!.id, {
    paypalOrderId: payment.paypalOrderId,
    status: payment.status,
    approveUrl: payment.approveUrl ?? null,
    captureId: payment.captureId ?? null,
  });
}

export async function findUserOrder(db: Database, userId: string, orderId: string) {
  if (!isUuid(orderId)) return undefined;
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return row;
}

export async function findOrderById(db: Database, orderId: string) {
  if (!isUuid(orderId)) return undefined;
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return row;
}

export async function findOrderByPayPalId(db: Database, paypalOrderId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId)).limit(1);
  return row;
}

export async function listUserOrders(db: Database, userId: string, limit: number) {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit);
}

function statusFromPayPal(payment: PaymentOrder): OrderStatus {
  switch (payment.status) {
    case "VOIDED":
      return "CANCELLED";
    case "SAVED":
      return "APPROVED";
    default:
      return payment.status;
  }
}

/**
 * Brings an order up to date with PayPal and captures it if the buyer
 * approved. Final orders are returned untouched, except that `reopenCancelled`
 * (the PayPal return route: proof the buyer approved after all) re-checks a
 * CANCELLED one. Throws OrderError on PayPal failures.
 */
export async function syncOrder(db: Database, payments: Payments, row: OrderRow, options: { reopenCancelled?: boolean } = {}) {
  const reopen = options.reopenCancelled && row.status === "CANCELLED";
  if ((isFinal(row.status) && !reopen) || !row.paypalOrderId) return row;
  try {
    let payment = await payments.getOrder(row.paypalOrderId);
    if (payment.status === "APPROVED" || payment.status === "SAVED") payment = await payments.captureOrder(row.paypalOrderId);
    const status = statusFromPayPal(payment);
    if (reopen && status !== "COMPLETED") return row;
    const newShipping = Boolean(payment.shipping) && !row.shipping;
    const changed = status !== row.status || (payment.captureId ?? null) !== row.captureId || newShipping;
    if (!changed) return row;
    // Never move a row off COMPLETED, even if two captures race.
    const [updated] = await db
      .update(orders)
      .set({
        status,
        captureId: payment.captureId ?? row.captureId,
        ...(payment.shipping ? { shipping: payment.shipping } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, row.id), notInArray(orders.status, reopen ? ["COMPLETED", "FAILED"] : [...FINAL_STATUSES])))
      .returning();
    return updated ?? (await findOrderById(db, row.id))!;
  } catch (error) {
    if (error instanceof PayPalApiError && error.issue === "ORDER_NOT_APPROVED") {
      throw new OrderError("not_approved", "The buyer hasn't approved this payment on PayPal yet.");
    }
    throw paymentsError(error);
  }
}

/** Marks an order CANCELLED unless it is already final. */
export async function cancelOrder(db: Database, orderId: string) {
  if (!isUuid(orderId)) return undefined;
  const [row] = await db
    .update(orders)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), notInArray(orders.status, [...FINAL_STATUSES])))
    .returning();
  return row ?? (await findOrderById(db, orderId));
}

export async function findOrderByCaptureId(db: Database, captureId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.captureId, captureId)).limit(1);
  return row;
}

/** Marks a paid order REFUNDED (from our refund call or PayPal's refund webhook). */
export async function markRefunded(db: Database, orderId: string, refundId: string | null) {
  const [row] = await db
    .update(orders)
    .set({ status: "REFUNDED", ...(refundId ? { refundId } : {}), updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "COMPLETED")))
    .returning();
  return row ?? (await findOrderById(db, orderId))!;
}

/** Refunds a paid order in full through PayPal. Throws OrderError. */
export async function refundOrder(db: Database, payments: Payments, row: OrderRow) {
  if (row.status === "REFUNDED") return row;
  if (row.status !== "COMPLETED" || !row.captureId) {
    throw new OrderError("not_refundable", "Only paid orders can be refunded.");
  }
  try {
    const refund = await payments.refundCapture(row.captureId, `refund-${row.id}`);
    return markRefunded(db, row.id, refund.refundId);
  } catch (error) {
    if (error instanceof PayPalApiError && error.issue === "CAPTURE_FULLY_REFUNDED") return markRefunded(db, row.id, null);
    throw paymentsError(error);
  }
}
