import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders } from "../src/project/schema.js";
import { fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";
import { signUp, startServer, type TestServer } from "./helpers/harness.js";

const paypal = fakePayments();
let server: TestServer;
let buyer: { cookie: string; userId: string };
let merchant: { cookie: string };
let orderId: string;

beforeAll(async () => {
  process.env.PAYOUT_ADMIN_USERNAMES = " store_owner ";
  server = await startServer({ catalog: fakeCatalog(), payments: paypal.payments });
  buyer = await signUp(server.baseUrl, "shopper");
  merchant = await signUp(server.baseUrl, "store_owner");
  const [order] = await server.db.insert(orders).values({
    userId: buyer.userId,
    status: "COMPLETED",
    currency: "USD",
    totalCents: 5000,
    items: [{ productId: "shoe", title: "Shoe", quantity: 1, unitCents: 5000, merchant: "store.example" }],
    captureId: "CAP-FIXTURE",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  orderId = order!.id;
});

afterAll(() => { delete process.env.PAYOUT_ADMIN_USERNAMES; return server.close(); });

const request = (path: string, cookie?: string, method = "GET", body?: unknown) =>
  fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("buyer and merchant access", () => {
  it("lets buyers request and cancel a refund, and denies merchant-only endpoints", async () => {
    const created = await request(`/api/orders/${orderId}/refund-request`, buyer.cookie, "POST", { amountCents: 1200, reason: "damaged_or_defective", note: "Box damaged" });
    expect(created.status).toBe(201);
    expect((await created.json()).order.refundRequest).toMatchObject({ amountCents: 1200, status: "pending", note: "Box damaged" });
    const duplicate = await request(`/api/orders/${orderId}/refund-request`, buyer.cookie, "POST", { reason: "other" });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe("request_pending");
    const cancelled = await request(`/api/orders/${orderId}/refund-request`, buyer.cookie, "DELETE");
    expect((await cancelled.json()).order.refundRequest.status).toBe("cancelled");
    for (const path of ["/api/merchant/orders", "/api/analytics", "/api/earnings"]) {
      expect((await request(path, buyer.cookie)).status).toBe(403);
    }
  });

  it("shows buyer names to the merchant and persists a decline message", async () => {
    const created = await request(`/api/orders/${orderId}/refund-request`, buyer.cookie, "POST", { reason: "not_as_described" });
    expect(created.status).toBe(201);
    const listed = await request("/api/merchant/orders", merchant.cookie);
    expect((await listed.json()).orders[0]).toMatchObject({ id: orderId, buyer: "shopper" });
    const declined = await request(`/api/merchant/orders/${orderId}/refund-request/decline`, merchant.cookie, "POST", { message: "Please send photos first." });
    expect((await declined.json()).order.refundRequest).toMatchObject({ status: "declined", merchantMessage: "Please send photos first." });
  });
});
