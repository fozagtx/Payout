import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders } from "../src/project/schema.js";
import { callTool, issueAccessToken, signUp, startServer, type TestServer } from "./helpers/harness.js";
import { SHIPPING, fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";

const paypal = fakePayments();
let server: TestServer;
let alice: { cookie: string; userId: string; token: string };
let bob: { cookie: string; userId: string };

beforeAll(async () => {
  server = await startServer({ catalog: fakeCatalog(), payments: paypal.payments });
  const a = await signUp(server.baseUrl, "alice");
  alice = { ...a, token: (await issueAccessToken(server.db, server.baseUrl, a.userId)).token };
  bob = await signUp(server.baseUrl, "bob");
});
afterAll(() => server.close());

async function newOrder(items = [{ product_id: "shoe", quantity: 1 }]) {
  const { data, isError } = await callTool(server.baseUrl, alice.token, "create_checkout", { items });
  if (isError) throw new Error(JSON.stringify(data));
  return data.order as { id: string; paypalOrderId: string; status: string };
}

const get = (path: string, cookie?: string) =>
  fetch(`${server.baseUrl}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

describe("GET /paypal/return", () => {
  it("captures an approved order without a session and redirects to the completion page", async () => {
    const order = await newOrder();
    paypal.approve(order.paypalOrderId);
    const response = await get(`/paypal/return?token=${order.paypalOrderId}&PayerID=PAYER1`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/checkout/complete?order=${order.id}`);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ status: "COMPLETED", captureId: `CAP-${order.paypalOrderId}` });

    // Reloading the return page is harmless.
    const calls = paypal.calls.length;
    const again = await get(`/paypal/return?token=${order.paypalOrderId}&PayerID=PAYER1`);
    expect(again.headers.get("location")).toBe(`/checkout/complete?order=${order.id}`);
    expect(paypal.calls.length).toBe(calls);
  });

  it("redirects with an error code when the buyer hasn't approved", async () => {
    const order = await newOrder();
    const response = await get(`/paypal/return?token=${order.paypalOrderId}`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/checkout/complete?order=${order.id}&error=not_approved`);
  });

  it("redirects unknown or missing tokens to order_not_found", async () => {
    expect((await get("/paypal/return?token=NOPE")).headers.get("location")).toBe("/checkout/complete?error=order_not_found");
    expect((await get("/paypal/return")).headers.get("location")).toBe("/checkout/complete?error=order_not_found");
  });
});

describe("GET /paypal/cancel", () => {
  it("marks an open order CANCELLED and redirects", async () => {
    const order = await newOrder();
    const response = await get(`/paypal/cancel?order=${order.id}`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/checkout/cancelled?order=${order.id}`);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.status).toBe("CANCELLED");
  });

  it("doesn't cancel a completed order", async () => {
    const order = await newOrder();
    paypal.approve(order.paypalOrderId);
    await get(`/paypal/return?token=${order.paypalOrderId}`);
    await get(`/paypal/cancel?order=${order.id}`);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.status).toBe("COMPLETED");
  });

  it("captures a cancelled order if the buyer went back and approved after all", async () => {
    const order = await newOrder();
    await get(`/paypal/cancel?order=${order.id}`);
    paypal.approve(order.paypalOrderId);
    const response = await get(`/paypal/return?token=${order.paypalOrderId}`);
    expect(response.headers.get("location")).toBe(`/checkout/complete?order=${order.id}`);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.status).toBe("COMPLETED");
  });

  it("handles a bad or missing order id", async () => {
    expect((await get("/paypal/cancel?order=not-a-uuid")).headers.get("location")).toBe("/checkout/cancelled");
    expect((await get("/paypal/cancel")).headers.get("location")).toBe("/checkout/cancelled");
  });
});

describe("GET /api/orders", () => {
  it("needs a session", async () => {
    expect((await get("/api/orders")).status).toBe(401);
  });

  it("lists only the signed-in user's orders, newest first", async () => {
    const body = await (await get("/api/orders", alice.cookie)).json();
    expect(body.orders.length).toBeGreaterThanOrEqual(5);
    const first = body.orders[0];
    expect(Object.keys(first).sort()).toEqual(
      ["approveUrl", "createdAt", "currency", "dispute", "id", "items", "paypalOrderId", "shipping", "status", "totalCents"]
    );
    const times = body.orders.map((o: any) => Date.parse(o.createdAt));
    expect([...times].sort((x: number, y: number) => y - x)).toEqual(times);
    expect(await (await get("/api/orders", bob.cookie)).json()).toEqual({ orders: [] });
  });
});

describe("GET /api/orders/:id/public", () => {
  it("returns minimal status without a session", async () => {
    const order = await newOrder([{ product_id: "sock", quantity: 2 }]);
    const response = await get(`/api/orders/${order.id}/public`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      order: {
        id: order.id,
        status: "PAYER_ACTION_REQUIRED",
        totalCents: 2500,
        currency: "USD",
        items: [{ productId: "sock", title: "Wool Sock", quantity: 2, unitCents: 1250 }],
      },
    });
  });

  it("404s unknown or malformed ids", async () => {
    expect((await get(`/api/orders/${crypto.randomUUID()}/public`)).status).toBe(404);
    expect((await get("/api/orders/nope/public")).status).toBe(404);
  });
});

describe("shipping, refunds and webhooks", () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${server.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  async function paidOrder() {
    const order = await newOrder();
    paypal.approve(order.paypalOrderId);
    await get(`/paypal/return?token=${order.paypalOrderId}`);
    return order;
  }

  it("saves the address the buyer chose on PayPal and shows it to the owner", async () => {
    const order = await paidOrder();
    const body = await (await get("/api/orders", alice.cookie)).json();
    expect(body.orders.find((o: any) => o.id === order.id).shipping).toEqual(SHIPPING);
    const pub = await (await get(`/api/orders/${order.id}/public`)).json();
    expect(pub.order).not.toHaveProperty("shipping");
  });

  it("refunds a paid order once, and only for its owner", async () => {
    const order = await paidOrder();
    expect((await post(`/api/orders/${order.id}/refund`, {})).status).toBe(401);
    expect((await post(`/api/orders/${order.id}/refund`, {}, { cookie: bob.cookie })).status).toBe(404);
    const response = await post(`/api/orders/${order.id}/refund`, {}, { cookie: alice.cookie });
    expect(response.status).toBe(200);
    expect((await response.json()).order.status).toBe("REFUNDED");
    const again = await post(`/api/orders/${order.id}/refund`, {}, { cookie: alice.cookie });
    expect((await again.json()).order.status).toBe("REFUNDED");
    expect(paypal.calls.filter((c) => c.startsWith("refund:")).at(-1)).toBe(`refund:CAP-${order.paypalOrderId}:refund-${order.id}`);
  });

  it("won't refund an unpaid order", async () => {
    const order = await newOrder();
    const response = await post(`/api/orders/${order.id}/refund`, {}, { cookie: alice.cookie });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("not_refundable");
  });

  it("ignores webhooks PayPal can't verify", async () => {
    const order = await newOrder();
    paypal.approve(order.paypalOrderId);
    const response = await post("/paypal/webhook", { event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: order.paypalOrderId } }, { "paypal-transmission-sig": "forged" });
    expect(response.status).toBe(400);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.status).toBe("PAYER_ACTION_REQUIRED");
  });

  it("captures on a verified approval webhook, then marks a webhook refund", async () => {
    const order = await newOrder();
    paypal.approve(order.paypalOrderId);
    const valid = { "paypal-transmission-sig": "valid" };
    expect((await post("/paypal/webhook", { event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: order.paypalOrderId } }, valid)).status).toBe(200);
    let [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ status: "COMPLETED", shipping: SHIPPING });
    const refund = {
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: "REF9", links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${row!.captureId}` }] },
    };
    expect((await post("/paypal/webhook", refund, valid)).status).toBe(200);
    [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ status: "REFUNDED", refundId: "REF9" });
  });

  it("returns and persists only disputes tied to this user's captures", async () => {
    const order = await paidOrder();
    paypal.seedDisputes([
      {
        disputeId: "DISPUTE-1",
        reason: "ITEM_NOT_RECEIVED",
        status: "OPEN",
        amountCents: 4999,
        currency: "USD",
        captureId: `CAP-${order.paypalOrderId}`,
      },
      {
        disputeId: "DISPUTE-OTHER",
        reason: "OTHER",
        status: "OPEN",
        amountCents: 100,
        currency: "USD",
        captureId: "CAP-not-owned",
      },
    ]);
    const response = await get("/api/disputes", alice.cookie);
    expect(response.status).toBe(200);
    expect((await response.json()).disputes).toEqual([
      {
        disputeId: "DISPUTE-1",
        reason: "ITEM_NOT_RECEIVED",
        status: "OPEN",
        amountCents: 4999,
        currency: "USD",
        captureId: `CAP-${order.paypalOrderId}`,
        orderId: order.id,
      },
    ]);
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ disputeId: "DISPUTE-1", disputeStatus: "OPEN", disputeReason: "ITEM_NOT_RECEIVED" });
    expect(await (await get("/api/disputes", bob.cookie)).json()).toEqual({ disputes: [] });
  });

  it("saves a dispute received in a verified PayPal webhook", async () => {
    const order = await paidOrder();
    const response = await post(
      "/paypal/webhook",
      {
        event_type: "CUSTOMER.DISPUTE.CREATED",
        resource: {
          dispute_id: "DISPUTE-WEBHOOK",
          status: "OPEN",
          reason: "DUPLICATE_TRANSACTION",
          disputed_transactions: [{ seller_transaction_id: `CAP-${order.paypalOrderId}` }],
        },
      },
      { "paypal-transmission-sig": "valid" }
    );
    expect(response.status).toBe(200);
    let [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({
      disputeId: "DISPUTE-WEBHOOK",
      disputeStatus: "OPEN",
      disputeReason: "DUPLICATE_TRANSACTION",
    });
    const update = await post(
      "/paypal/webhook",
      {
        event_type: "CUSTOMER.DISPUTE.UPDATED",
        resource: {
          dispute_id: "DISPUTE-WEBHOOK",
          status: "UNDER_REVIEW",
          reason: "DUPLICATE_TRANSACTION",
          disputed_transactions: [{ seller_transaction_id: `CAP-${order.paypalOrderId}` }],
        },
      },
      { "paypal-transmission-sig": "valid" }
    );
    expect(update.status).toBe(200);
    [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ disputeId: "DISPUTE-WEBHOOK", disputeStatus: "UNDER_REVIEW" });
  });
});
