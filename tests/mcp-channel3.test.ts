import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders } from "../src/project/schema.js";
import type { Product } from "@channel3/sdk/resources";
import type { Storefront, StorefrontSearch } from "../src/project/channel3/storefront.js";
import type { SelectedOptions } from "../src/project/services.js";
import { callTool, issueAccessToken, mcpCall, signUp, startServer, type TestServer } from "./helpers/harness.js";
import { fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";

const sdkProduct = (id: string, price = 42): Product => ({
  id,
  title: `Product ${id}`,
  brands: [{ id: "b", name: "Acme" }],
  offers: [
    { url: `https://buy.trychannel3.com/${id}-b`, domain: "pricey.example", price: { price: price + 10, currency: "USD" }, availability: "InStock" },
    { url: `https://buy.trychannel3.com/${id}-a`, domain: "cheap.example", price: { price, currency: "USD" }, availability: "InStock" },
  ],
  variants: {
    options: [{ name: "Size", values: [{ label: "9", exists: true, available: "InStock" }, { label: "10", exists: true, available: "OutOfStock" }, { label: "11", exists: false }] }],
    selected: [],
  },
});

const searches: StorefrontSearch[] = [];
const retrieves: { id: string; options?: SelectedOptions }[] = [];
const lookups: string[] = [];
const earningsCalls: { userId?: string; days?: number }[] = [];
const subscriptions = { requested: [] as string[], canceled: [] as string[] };
const storefront: Storefront = {
  async search(input) {
    searches.push(input);
    return { products: [sdkProduct("img1"), sdkProduct("img2")], nextPageToken: null };
  },
  async product(id, options) {
    retrieves.push({ id, ...(options ? { options } : {}) });
    return id === "missing" ? undefined : sdkProduct(id);
  },
  priceHistory: async (id) => ({
    canonical_product_id: id,
    statistics: { mean: 50, std_dev: 3, min_price: 40, max_price: 60, current_price: 42, current_status: "low", currency: "USD" },
  }),
  similar: async (id, limit) => [sdkProduct(`${id}-like`, 30)].slice(0, limit),
  brands: async () => [],
  websites: async () => [],
  categories: async () => [],
  category: async () => undefined,
  async lookup(url) {
    lookups.push(url);
    return url.includes("missing") ? undefined : sdkProduct("linked-product", 25);
  },
  async subscribe(productId) {
    subscriptions.requested.push(productId);
    return `subscription-${productId}`;
  },
  async unsubscribe(subscriptionId) {
    subscriptions.canceled.push(subscriptionId);
  },
  async earnings(userId, days) {
    earningsCalls.push({ ...(userId ? { userId } : {}), ...(days === undefined ? {} : { days }) });
    return {
      clicks: 8,
      sales: 2,
      transactions: [{ date: "2026-10-01T00:00:00.000Z", merchant: "Acme", saleAmount: 40, commission: 4, currency: "USD", status: "PAID" }],
      totals: { sales: 40, commission: 4, currency: "USD" },
    };
  },
};

let server: TestServer;
let token: string;
const paypal = fakePayments();
let userId: string;
let buyerToken: string;
let buyerOrderId: string;

beforeAll(async () => {
  process.env.PAYOUT_ADMIN_USERNAMES = "claude_user";
  server = await startServer({ storefront, catalog: fakeCatalog(), payments: paypal.payments });
  ({ userId } = await signUp(server.baseUrl, "claude_user"));
  token = (await issueAccessToken(server.db, server.baseUrl, userId)).token;
  const buyer = await signUp(server.baseUrl, "ordinary_buyer");
  buyerToken = (await issueAccessToken(server.db, server.baseUrl, buyer.userId)).token;
  const [order] = await server.db.insert(orders).values({
    userId: buyer.userId,
    status: "COMPLETED",
    currency: "USD",
    totalCents: 2500,
    items: [{ productId: "shoe", title: "Shoe", quantity: 1, unitCents: 2500, merchant: "shop.example" }],
    captureId: "CAP-MCP-REQUEST",
  }).returning();
  buyerOrderId = order!.id;
});
afterAll(() => { delete process.env.PAYOUT_ADMIN_USERNAMES; return server.close(); });

describe("Channel3 MCP tools", () => {
  it("lists the new tools, with the grid UI on find_similar_products", async () => {
    const { tools } = await mcpCall(server.baseUrl, token, "tools/list");
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_product_details", "find_similar_products", "compare_link", "list_disputes", "get_earnings"]));
    expect(tools.find((t: any) => t.name === "find_similar_products")._meta["ui/resourceUri"]).toBeDefined();
    expect(tools.find((t: any) => t.name === "search_products").inputSchema.properties).toHaveProperty("image_url");
  });

  it("search_products with image_url searches Channel3 by image and shows the cheapest in-stock offer", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "search_products", { query: "shoe", image_url: "https://img.example/shoe.jpg", max_price: 80, limit: 1 });
    expect(isError).toBe(false);
    expect(searches.at(-1)).toMatchObject({ query: "shoe", imageUrl: "https://img.example/shoe.jpg", filters: { price: { max_price: 80 } } });
    expect(data.products).toHaveLength(1);
    expect(data.products[0]).toMatchObject({ id: "img1", priceCents: 4200, merchant: "cheap.example" });
  });

  it("get_product_details returns sizes, stores cheapest first and the price verdict", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "get_product_details", { product_id: "p1", selected_options: { Size: "9" } });
    expect(isError).toBe(false);
    expect(retrieves.at(-1)).toEqual({ id: "p1", options: { Size: "9" } });
    expect(data.options).toEqual([{ name: "Size", values: [{ value: "9", availability: "InStock" }, { value: "10", availability: "OutOfStock" }] }]);
    expect(data.offers.map((o: any) => o.store)).toEqual(["cheap.example", "pricey.example"]);
    expect(data.price_history).toMatchObject({ low: 40, high: 60, verdict: "low" });
  });

  it("get_product_details reports an unknown product", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "get_product_details", { product_id: "missing" });
    expect(isError).toBe(true);
    expect(data.code).toBe("product_not_found");
  });

  it("compare_link shares the detailed product shape and orders stores cheapest first", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "compare_link", { url: "https://store.example/item" });
    expect(isError).toBe(false);
    expect(lookups.at(-1)).toBe("https://store.example/item");
    expect(data.id).toBe("linked-product");
    expect(data.offers.map((offer: any) => offer.store)).toEqual(["cheap.example", "pricey.example"]);
    expect(data.price_history.verdict).toBe("low");
  });

  it("find_similar_products fills the grid", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "find_similar_products", { product_id: "p1", max_price: 50 });
    expect(isError).toBe(false);
    expect(data.products.map((p: any) => p.id)).toEqual(["p1-like"]);
  });

  it("create_checkout accepts the chosen size", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "create_checkout", { items: [{ product_id: "shoe", quantity: 1, options: { Size: "9" } }] });
    expect(isError).toBe(false);
    expect(data.order.items[0]).toMatchObject({ productId: "shoe", title: "Trail Runner Shoe (9)", options: { Size: "9" } });
  });

  it("lists disputes associated with the signed-in user's orders", async () => {
    const { data: checkout } = await callTool(server.baseUrl, token, "create_checkout", { items: [{ product_id: "shoe", quantity: 1 }] });
    paypal.approve(checkout.order.paypalOrderId);
    await callTool(server.baseUrl, token, "get_order_status", { order_id: checkout.order.id });
    paypal.seedDisputes([{
      disputeId: "DISPUTE-MCP",
      reason: "ITEM_NOT_RECEIVED",
      status: "OPEN",
      amountCents: 4999,
      currency: "USD",
      captureId: `CAP-${checkout.order.paypalOrderId}`,
    }]);
    const { data, isError } = await callTool(server.baseUrl, token, "list_disputes", {});
    expect(isError).toBe(false);
    expect(data.disputes).toEqual([
      expect.objectContaining({
        disputeId: "DISPUTE-MCP",
        reason: "ITEM_NOT_RECEIVED",
        status: "OPEN",
        amountCents: 4999,
        orderId: checkout.order.id,
      }),
    ]);
  });

  it("returns per-user Channel3 earnings", async () => {
    const { data, isError } = await callTool(server.baseUrl, token, "get_earnings", { days: 14 });
    expect(isError).toBe(false);
    expect(data).toMatchObject({ clicks: 8, sales: 2, totals: { commission: 4, currency: "USD" } });
    expect(earningsCalls.at(-1)).toEqual({ userId: undefined, days: 14 });
  });

  it("restricts buyer earnings and allows refund requests through MCP", async () => {
    const denied = await callTool(server.baseUrl, buyerToken, "get_earnings", { days: 14 });
    expect(denied.isError).toBe(true);
    expect(denied.data).toMatchObject({ code: "merchant_only" });
    const requested = await callTool(server.baseUrl, buyerToken, "request_refund", { order_id: buyerOrderId, reason: "other", amount_cents: 1000 });
    expect(requested.isError).toBe(false);
    expect(requested.data.order.refundRequest).toMatchObject({ status: "pending", amountCents: 1000 });
  });
});
