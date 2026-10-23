import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { orders } from "../src/project/schema.js";
import { toolActivity } from "../src/mcp-kit/schema.js";
import { SHOP_WIDGET_URI } from "../src/project/ui/resource.js";
import { callTool, issueAccessToken, mcpCall, signUp, startServer, users, type TestServer } from "./helpers/harness.js";
import { fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";

const catalog = fakeCatalog();
const paypal = fakePayments();
let server: TestServer;
let alice: { userId: string; token: string; connectionId: string };
let bob: { userId: string; token: string };

beforeAll(async () => {
  server = await startServer({ catalog, payments: paypal.payments });
  const a = await signUp(server.baseUrl, "alice");
  await server.db.update(users).set({ paypalEmail: "alice-buyer@personal.example.com" }).where(eq(users.id, a.userId));
  alice = { userId: a.userId, ...(await issueAccessToken(server.db, server.baseUrl, a.userId)) };
  const b = await signUp(server.baseUrl, "bob");
  bob = { userId: b.userId, ...(await issueAccessToken(server.db, server.baseUrl, b.userId)) };
});
afterAll(() => server.close());
beforeEach(() => paypal.failNextCreates(undefined));

const checkout = (token: string, items: unknown) => callTool(server.baseUrl, token, "create_checkout", { items });

describe("create_checkout", () => {
  it("is listed with the shop widget and a model-facing description", async () => {
    const { tools } = await mcpCall(server.baseUrl, alice.token, "tools/list");
    const tool = tools.find((t: any) => t.name === "create_checkout");
    expect(tool._meta.ui.resourceUri).toBe(SHOP_WIDGET_URI);
    expect(tool._meta["ui/resourceUri"]).toBe(SHOP_WIDGET_URI);
    expect(tool.description).toMatch(/confirm/i);
    const status = tools.find((t: any) => t.name === "get_order_status");
    expect(status._meta.ui.resourceUri).toBe(SHOP_WIDGET_URI);
    expect(status.annotations.readOnlyHint).toBe(false);
    expect(tools.find((t: any) => t.name === "list_orders").annotations.readOnlyHint).toBe(true);
  });

  it("re-fetches prices, merges duplicates, totals in cents and creates a PayPal order", async () => {
    const { data, isError, raw } = await checkout(alice.token, [
      { product_id: "shoe", quantity: 1, unit_cents: 1 },
      { product_id: "sock", quantity: 2, price: 0 },
      { product_id: "shoe", quantity: 1 },
    ]);
    expect(isError).toBe(false);
    const order = data.order;
    expect(Object.keys(data)).toEqual(["order"]);
    expect(order.status).toBe("PAYER_ACTION_REQUIRED");
    expect(order.paypalOrderId).toMatch(/^PP-/);
    expect(order.approveUrl).toBe(`https://sandbox.paypal.test/checkoutnow?token=${order.paypalOrderId}`);
    expect(order.currency).toBe("USD");
    expect(order.totalCents).toBe(2 * 4999 + 2 * 1250);
    expect(order.items).toEqual([
      { productId: "shoe", title: "Trail Runner Shoe", quantity: 2, unitCents: 4999, imageUrl: "https://img.test/shoe.jpg", merchant: "Acme Store" },
      { productId: "sock", title: "Wool Sock", quantity: 2, unitCents: 1250 },
    ]);
    expect(Object.keys(order).sort()).toEqual(["approveUrl", "currency", "id", "items", "paypalOrderId", "status", "totalCents"]);

    const input = paypal.created.at(-1)!;
    expect(input.referenceId).toBe(order.id);
    expect(input.currency).toBe("USD");
    expect(input.lines).toEqual(order.items);
    expect(input.returnUrl).toBe(`${server.baseUrl}/paypal/return`);
    expect(input.cancelUrl).toBe(`${server.baseUrl}/paypal/cancel?order=${order.id}`);
    expect(input.payerEmail).toBe("alice-buyer@personal.example.com");

    const text = raw.content.find((c: any) => c.type === "text").text as string;
    expect(text).toContain(order.approveUrl);
    expect(text).toMatch(/approve/i);

    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ userId: alice.userId, connectionId: alice.connectionId, paypalOrderId: order.paypalOrderId, status: "PAYER_ACTION_REQUIRED", totalCents: 12498 });
  });

  it("rejects unknown, out-of-stock and non-USD products without calling PayPal", async () => {
    const before = paypal.created.length;
    const unknown = await checkout(alice.token, [{ product_id: "shoe", quantity: 1 }, { product_id: "nope", quantity: 1 }]);
    expect(unknown.isError).toBe(true);
    expect(unknown.data).toMatchObject({ code: "product_not_found", product_id: "nope" });
    expect((await checkout(alice.token, [{ product_id: "gone", quantity: 1 }])).data.code).toBe("out_of_stock");
    expect((await checkout(alice.token, [{ product_id: "euro", quantity: 1 }])).data.code).toBe("unsupported_currency");
    expect(paypal.created.length).toBe(before);
  });

  it("validates quantities and item counts", async () => {
    const tooMany = await mcpCall(server.baseUrl, alice.token, "tools/call", {
      name: "create_checkout",
      arguments: { items: [{ product_id: "shoe", quantity: 11 }] },
    });
    expect(tooMany.isError).toBe(true);
    const empty = await mcpCall(server.baseUrl, alice.token, "tools/call", { name: "create_checkout", arguments: { items: [] } });
    expect(empty.isError).toBe(true);
    // Merged quantities over the limit are also refused.
    const merged = await checkout(alice.token, [{ product_id: "shoe", quantity: 6 }, { product_id: "shoe", quantity: 6 }]);
    expect(merged.isError).toBe(true);
    expect(merged.data.code).toBe("invalid_quantity");
  });

  it("reports PayPal failures and marks the order FAILED", async () => {
    paypal.failNextCreates(new Error("paypal_not_configured"));
    const notConfigured = await checkout(alice.token, [{ product_id: "sock", quantity: 1 }]);
    expect(notConfigured.isError).toBe(true);
    expect(notConfigured.data.code).toBe("paypal_not_configured");

    paypal.failNextCreates(new Error("boom"));
    const failed = await checkout(alice.token, [{ product_id: "sock", quantity: 1 }]);
    expect(failed.data.code).toBe("paypal_error");

    const rows = await server.db.select().from(orders).where(eq(orders.userId, alice.userId));
    expect(rows.filter((r) => r.status === "FAILED")).toHaveLength(2);
    const log = await server.db.select().from(toolActivity).where(eq(toolActivity.connectionId, alice.connectionId));
    expect(log.filter((l) => l.tool === "create_checkout" && l.decision === "error")).toHaveLength(2);
  });

  it("requires the shop:checkout scope", async () => {
    const { token } = await issueAccessToken(server.db, server.baseUrl, alice.userId, ["shop:browse", "orders:read"]);
    const { data, isError } = await checkout(token, [{ product_id: "sock", quantity: 1 }]);
    expect(isError).toBe(true);
    expect(data).toEqual({ code: "insufficient_scope", required: "shop:checkout" });
  });
});

describe("get_order_status and list_orders", () => {
  it("polls PayPal, captures once approved and stores COMPLETED", async () => {
    const { data } = await checkout(alice.token, [{ product_id: "sock", quantity: 3 }]);
    const id = data.order.id as string;

    const pending = await callTool(server.baseUrl, alice.token, "get_order_status", { order_id: id });
    expect(pending.isError).toBe(false);
    expect(pending.data.order.status).toBe("PAYER_ACTION_REQUIRED");

    paypal.approve(data.order.paypalOrderId);
    const done = await callTool(server.baseUrl, alice.token, "get_order_status", { order_id: id });
    expect(done.data.order).toMatchObject({ id, status: "COMPLETED", totalCents: 3750, currency: "USD" });
    const [row] = await server.db.select().from(orders).where(eq(orders.id, id));
    expect(row!.captureId).toBe(`CAP-${data.order.paypalOrderId}`);
    expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());

    // Final: no more PayPal calls.
    const callsBefore = paypal.calls.length;
    const again = await callTool(server.baseUrl, alice.token, "get_order_status", { order_id: id });
    expect(again.data.order.status).toBe("COMPLETED");
    expect(paypal.calls.length).toBe(callsBefore);
  });

  it("never shows or captures another user's order", async () => {
    const { data } = await checkout(alice.token, [{ product_id: "shoe", quantity: 1 }]);
    paypal.approve(data.order.paypalOrderId);
    const callsBefore = paypal.calls.length;
    const peek = await callTool(server.baseUrl, bob.token, "get_order_status", { order_id: data.order.id });
    expect(peek.isError).toBe(true);
    expect(peek.data.code).toBe("order_not_found");
    expect(paypal.calls.length).toBe(callsBefore);
    const bobs = await callTool(server.baseUrl, bob.token, "list_orders", {});
    expect(bobs.data.orders).toEqual([]);
  });

  it("rejects a non-uuid order id and needs orders:read", async () => {
    const bad = await mcpCall(server.baseUrl, alice.token, "tools/call", { name: "get_order_status", arguments: { order_id: "x" } });
    expect(bad.isError).toBe(true);
    const { token } = await issueAccessToken(server.db, server.baseUrl, alice.userId, ["shop:browse"]);
    expect((await callTool(server.baseUrl, token, "list_orders", {})).data.code).toBe("insufficient_scope");
    expect((await callTool(server.baseUrl, token, "get_order_status", { order_id: crypto.randomUUID() })).data.code).toBe("insufficient_scope");
  });

  it("lists own orders newest first with a limit", async () => {
    const all = await callTool(server.baseUrl, alice.token, "list_orders", {});
    expect(all.isError).toBe(false);
    const list = all.data.orders as any[];
    expect(list.length).toBeGreaterThanOrEqual(5);
    const times = list.map((o) => Date.parse(o.createdAt));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(list[0]).toHaveProperty("totalCents");
    expect(list[0]).toHaveProperty("items");
    const limited = await callTool(server.baseUrl, alice.token, "list_orders", { limit: 2 });
    expect(limited.data.orders).toHaveLength(2);
  });
});
