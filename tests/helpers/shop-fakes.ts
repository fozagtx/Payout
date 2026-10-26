import { PayPalApiError } from "../../src/project/paypal/client.js";
import type { Catalog, CreatePaymentInput, Dispute, PayPalOrderStatus, Payments, Product } from "../../src/project/services.js";

export const PRODUCTS: Product[] = [
  { id: "shoe", title: "Trail Runner Shoe", brand: "Acme", priceCents: 4999, currency: "USD", inStock: true, imageUrl: "https://img.test/shoe.jpg", merchant: "Acme Store" },
  { id: "sock", title: "Wool Sock", priceCents: 1250, currency: "USD", inStock: true },
  { id: "gone", title: "Sold Out Jacket", priceCents: 19900, currency: "USD", inStock: false },
  { id: "euro", title: "Euro Mug", priceCents: 900, currency: "EUR", inStock: true },
];

export function fakeCatalog(products: Product[] = PRODUCTS): Catalog & { gets: string[] } {
  const gets: string[] = [];
  return {
    gets,
    search: async () => products,
    get: async (id) => {
      gets.push(id);
      return products.find((p) => p.id === id);
    },
  };
}

type FakeOrder = { status: PayPalOrderStatus; captureId?: string; refunded?: boolean; input: CreatePaymentInput };

export const SHIPPING = { name: "Alice Buyer", line1: "1 Main St", city: "San Jose", state: "CA", postalCode: "95131", countryCode: "US" };

/** In-memory PayPal: orders start PAYER_ACTION_REQUIRED; approve() simulates the buyer. */
export function fakePayments() {
  const orders = new Map<string, FakeOrder>();
  const created: CreatePaymentInput[] = [];
  const calls: string[] = [];
  let next = 1;
  let failCreate: Error | undefined;
  let disputes: Dispute[] = [];

  const view = (id: string) => {
    const order = orders.get(id);
    if (!order) throw new PayPalApiError(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
    return {
      paypalOrderId: id,
      status: order.status,
      ...(order.status === "PAYER_ACTION_REQUIRED" ? { approveUrl: `https://sandbox.paypal.test/checkoutnow?token=${id}` } : {}),
      ...(order.captureId ? { captureId: order.captureId } : {}),
      ...(order.status === "APPROVED" || order.status === "COMPLETED" ? { shipping: SHIPPING } : {}),
    };
  };

  const payments: Payments = {
    async createOrder(input) {
      calls.push("create");
      if (failCreate) throw failCreate;
      created.push(input);
      const id = `PP-${next++}`;
      orders.set(id, { status: "PAYER_ACTION_REQUIRED", input });
      return view(id);
    },
    async getOrder(id) {
      calls.push(`get:${id}`);
      return view(id);
    },
    async captureOrder(id) {
      calls.push(`capture:${id}`);
      const order = orders.get(id);
      if (!order) throw new PayPalApiError(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
      if (order.status === "COMPLETED") return view(id);
      if (order.status !== "APPROVED") throw new PayPalApiError(422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED");
      order.status = "COMPLETED";
      order.captureId = `CAP-${id}`;
      return view(id);
    },
    async refundCapture(captureId, requestId) {
      calls.push(`refund:${captureId}:${requestId}`);
      const order = [...orders.values()].find((o) => o.captureId === captureId);
      if (!order) throw new PayPalApiError(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
      if (order.refunded) throw new PayPalApiError(422, "UNPROCESSABLE_ENTITY", "CAPTURE_FULLY_REFUNDED");
      order.refunded = true;
      return { refundId: `REF-${captureId}`, status: "COMPLETED" };
    },
    async listDisputes() {
      calls.push("list-disputes");
      return disputes;
    },
    async verifyWebhook({ headers }) {
      calls.push("verify-webhook");
      return headers["paypal-transmission-sig"] === "valid";
    },
  };

  return {
    payments,
    created,
    calls,
    approve(id: string) {
      orders.get(id)!.status = "APPROVED";
    },
    failNextCreates(error: Error | undefined) {
      failCreate = error;
    },
    seedDisputes(value: Dispute[]) {
      disputes = value;
    },
  };
}
