import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";
import { callTool, issueAccessToken, signUp, startServer, type TestServer } from "./helpers/harness.js";

const paypal = fakePayments();
let server: TestServer;
let buyer: { cookie: string; userId: string };
let buyerToken: string;
let orderId: string;

beforeAll(async () => {
  server = await startServer({ catalog: fakeCatalog(), payments: paypal.payments });
  buyer = await signUp(server.baseUrl, "shopper");
  buyerToken = (await issueAccessToken(server.db, server.baseUrl, buyer.userId)).token;
  const { data: checkout } = await callTool(server.baseUrl, buyerToken, "create_checkout", {
    items: [{ product_id: "shoe", quantity: 1 }],
  });
  paypal.approve(checkout.order.paypalOrderId);
  await callTool(server.baseUrl, buyerToken, "get_order_status", { order_id: checkout.order.id });
  orderId = checkout.order.id;
});

afterAll(() => server.close());

describe("self-serve refunds", () => {
  it("lets a user refund their own order and hides other users' orders", async () => {
    const response = await fetch(`${server.baseUrl}/api/orders/${orderId}/refund`, {
      method: "POST",
      headers: { cookie: buyer.cookie, "content-type": "application/json" },
      body: JSON.stringify({ amountCents: 1200, reason: "damaged_or_defective", note: "Box damaged" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).order).toMatchObject({
      status: "PARTIALLY_REFUNDED",
      refundedCents: 1200,
      refunds: [{ cents: 1200, reason: "damaged_or_defective", note: "Box damaged" }],
    });

    const other = await signUp(server.baseUrl, "another_shopper");
    const hidden = await fetch(`${server.baseUrl}/api/orders/${orderId}/refund`, {
      method: "POST",
      headers: { cookie: other.cookie, "content-type": "application/json" },
      body: JSON.stringify({ reason: "other" }),
    });
    expect(hidden.status).toBe(404);
  });
});
