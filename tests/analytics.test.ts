import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordRefund } from "../src/project/orders.js";
import { orders, priceWatches } from "../src/project/schema.js";
import { signUp, startServer, type TestServer } from "./helpers/harness.js";

let server: TestServer;
let alice: { cookie: string; userId: string };
let orderId: string;
const originalLicenseKey = process.env.AGGRID_LICENSE_KEY;

beforeAll(async () => {
  delete process.env.AGGRID_LICENSE_KEY;
  process.env.PAYOUT_ADMIN_USERNAMES = "analytics_user";
  server = await startServer();
  alice = await signUp(server.baseUrl, "analytics_user");
  const [order] = await server.db
    .insert(orders)
    .values({
      userId: alice.userId,
      status: "COMPLETED",
      currency: "USD",
      totalCents: 9500,
      items: [
        { productId: "trail-shoe", title: "Trail shoe", quantity: 2, unitCents: 4250, merchant: "Trail Goods" },
        { productId: "wool-socks", title: "Wool socks", quantity: 1, unitCents: 1000, merchant: "Sock Depot" },
      ],
      shipping: { name: "Alex Buyer", countryCode: "CA" },
      disputeId: "DISPUTE-ANALYTICS",
      disputeStatus: "UNDER_REVIEW",
      createdAt: new Date("2024-06-07T23:30:00.000Z"),
      updatedAt: new Date("2024-06-07T23:30:00.000Z"),
    })
    .returning();
  orderId = order!.id;
  await recordRefund(server.db, orderId, {
    id: "REFUND-ANALYTICS",
    cents: 1500,
    reason: "damaged_or_defective",
    note: "Replacement requested",
  });
  await server.db.insert(priceWatches).values({
    userId: alice.userId,
    productId: "trail-shoe",
    title: "Trail shoe",
    startCents: 3400,
    lastCents: 3100,
    lastInStock: true,
    alert: "Price dropped at trail.example",
    createdAt: new Date("2024-06-08T01:00:00.000Z"),
  });
});

afterAll(async () => {
  if (originalLicenseKey === undefined) delete process.env.AGGRID_LICENSE_KEY;
  else process.env.AGGRID_LICENSE_KEY = originalLicenseKey;
  delete process.env.PAYOUT_ADMIN_USERNAMES;
  await server.close();
});

const getAnalytics = (cookie?: string) =>
  fetch(`${server.baseUrl}/api/analytics`, {
    headers: cookie ? { cookie } : {},
  });

describe("GET /api/analytics", () => {
  it("requires a session and disables caching", async () => {
    const response = await getAnalytics();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "not_signed_in" });
  });

  it("maps the signed-in user's order, items, refund, watch, and license key", async () => {
    const response = await getAnalytics(alice.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();

    expect(body.licenseKey).toBeNull();
    expect(body.orders).toEqual([
      {
        id: orderId,
        date: "2024-06-07",
        status: "PARTIALLY_REFUNDED",
        statusGroup: "Partially refunded",
        currency: "USD",
        total: 95,
        refunded: 15,
        net: 80,
        disputed: 1,
        disputeStatus: "UNDER_REVIEW",
        merchant: "Trail Goods",
        itemCount: 3,
        shipCountry: "CA",
        buyer: "analytics_user",
      },
    ]);
    expect(body.items).toEqual([
      { orderId, title: "Trail shoe", merchant: "Trail Goods", quantity: 2, unitPrice: 42.5, lineTotal: 85 },
      { orderId, title: "Wool socks", merchant: "Sock Depot", quantity: 1, unitPrice: 10, lineTotal: 10 },
    ]);
    expect(body.refunds).toEqual([
      expect.objectContaining({
        orderId,
        amount: 15,
        reason: "Damaged or defective",
      }),
    ]);
    expect(body.refunds[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.watches).toEqual([
      {
        id: expect.any(String),
        title: "Trail shoe",
        startPrice: 34,
        lastPrice: 31,
        change: -3,
        inStock: true,
        alert: "Price dropped at trail.example",
        date: "2024-06-08",
      },
    ]);
    expect(body.earnings).toEqual({
      available: false,
      message: "Earnings need CHANNEL3_API_KEY on this server.",
      clicks: 0,
      transactions: [],
    });

    process.env.AGGRID_LICENSE_KEY = "  AGSTUDIO-TEST-KEY  ";
    const licensedResponse = await getAnalytics(alice.cookie);
    expect((await licensedResponse.json()).licenseKey).toBe("AGSTUDIO-TEST-KEY");
  });
});
