import { PayPalApiError } from "../../src/project/paypal/client.js";
import type { Catalog, CreatePaymentInput, PayPalOrderStatus, Payments, Product } from "../../src/project/services.js";

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

type FakeOrder = { status: PayPalOrderStatus; captureId?: string; input: CreatePaymentInput };

/** In-memory PayPal: orders start PAYER_ACTION_REQUIRED; approve() simulates the buyer. */
export function fakePayments() {
  const orders = new Map<string, FakeOrder>();
  const created: CreatePaymentInput[] = [];
  const calls: string[] = [];
  let next = 1;
  let failCreate: Error | undefined;

  const view = (id: string) => {
    const order = orders.get(id);
    if (!order) throw new PayPalApiError(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
    return {
      paypalOrderId: id,
      status: order.status,
      ...(order.status === "PAYER_ACTION_REQUIRED" ? { approveUrl: `https://sandbox.paypal.test/checkoutnow?token=${id}` } : {}),
      ...(order.captureId ? { captureId: order.captureId } : {}),
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
  };
}
