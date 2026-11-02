import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import express from "express";
import { createStorefrontRouter } from "../src/project/api/storefront.js";
import { createCookieSession } from "../src/project/session.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Product } from "@channel3/sdk/resources";
import { Channel3ProductProcessingError, createStorefront } from "../src/project/channel3/storefront.js";
import { orders } from "../src/project/schema.js";
import type { Storefront, StorefrontSearch } from "../src/project/channel3/storefront.js";
import type { Catalog, Product as CatalogProduct, SelectedOptions } from "../src/project/services.js";
import { signUp, startServer, type TestServer } from "./helpers/harness.js";
import { fakePayments } from "./helpers/shop-fakes.js";

const sdkProduct = (id: string, extra: Partial<Product> = {}): Product => ({
  id,
  title: `Product ${id}`,
  offers: [{ url: `https://go.trychannel3.com/${id}`, domain: "shop.example", price: { price: 42, currency: "USD" }, availability: "InStock" }],
  ...extra,
});

function fakeStorefront() {
  const searches: StorefrontSearch[] = [];
  const resolves: { id: string; selection?: SelectedOptions }[] = [];
  const lookups: { url: string; userId?: string }[] = [];
  const subscriptions = { requested: [] as string[], canceled: [] as string[] };
  const storefront: Storefront = {
    async search(input) {
      searches.push(input);
      return { products: [sdkProduct("p1"), sdkProduct("p2")], nextPageToken: input.pageToken ? null : "next-1" };
    },
    async product(id, selection) {
      resolves.push({ id, ...(selection ? { selection } : {}) });
      return id === "missing" ? undefined : sdkProduct(id, selection ? { title: `Product ${id} ${Object.values(selection).join("/")}` } : {});
    },
    async priceHistory(id) {
      return { canonical_product_id: id, history: [{ timestamp: new Date("2026-10-01T00:00:00Z"), price: 40, currency: "USD" }] };
    },
    async similar(id, limit) {
      return [sdkProduct(`${id}-like`)].slice(0, limit);
    },
    brands: async (q) => [{ id: "b1", name: q }],
    websites: async () => [],
    categories: async () => [],
    category: async () => undefined,
    async lookup(url, userId) {
      lookups.push({ url, ...(userId ? { userId } : {}) });
      return url.includes("missing") ? undefined : sdkProduct("lookup-result");
    },
    async subscribe(productId) {
      subscriptions.requested.push(productId);
      return `subscription-${productId}`;
    },
    async unsubscribe(subscriptionId) {
      subscriptions.canceled.push(subscriptionId);
    },
    async earnings() {
      return { clicks: 3, sales: 1, transactions: [], totals: { sales: 40, commission: 2, currency: "USD" } };
    },
  };
  return { storefront, searches, resolves, lookups, subscriptions };
}

const catalogGets: { id: string; options?: SelectedOptions }[] = [];
const catalog: Catalog = {
  search: async () => [],
  async get(id, options) {
    catalogGets.push({ id, ...(options ? { options } : {}) });
    const product: CatalogProduct = { id, title: "Trail Runner", priceCents: 4200, currency: "USD", inStock: true, merchant: "shop.example" };
    return id === "missing" ? undefined : product;
  },
};

const fake = fakeStorefront();
const paypal = fakePayments();
let server: TestServer;
let cookie: string;

beforeAll(async () => {
  server = await startServer({ storefront: fake.storefront, catalog, payments: paypal.payments });
  cookie = (await signUp(server.baseUrl, "shopper")).cookie;
});
afterAll(() => server.close());
afterEach(() => vi.restoreAllMocks());

describe("Channel3 product subscriptions", () => {
  it("uses the product subscription endpoint and documented event body", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ input, init });
      return requests.length === 1
        ? new Response(JSON.stringify({ subscription_id: "sub-123" }), { status: 201 })
        : new Response(null, { status: 404 });
    });
    const storefront = createStorefront("channel3-test-key");

    expect(await storefront.subscribe("product-123")).toBe("sub-123");
    await storefront.unsubscribe("sub-123");

    expect(String(requests[0]!.input)).toBe("https://api.trychannel3.com/v1/product-subscriptions");
    expect(requests[0]!.init?.method).toBe("POST");
    expect(requests[0]!.init?.headers).toEqual({ "content-type": "application/json", "x-api-key": "channel3-test-key" });
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({
      product_id: "product-123",
      events: ["offer.price.changed", "offer.availability.changed"],
    });
    expect(String(requests[1]!.input)).toBe("https://api.trychannel3.com/v1/product-subscriptions/sub-123");
    expect(requests[1]!.init).toMatchObject({
      method: "DELETE",
      headers: { "x-api-key": "channel3-test-key" },
    });
  });

  it("throws a typed error while Channel3 is processing the product", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 409 }));
    await expect(createStorefront("channel3-test-key").subscribe("product-123")).rejects.toBeInstanceOf(
      Channel3ProductProcessingError
    );
  });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${server.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("storefront without CHANNEL3_API_KEY", () => {
  it("reports search as off and refuses searches with a clear message", async () => {
    const app = express().use(createStorefrontRouter(server.db, createCookieSession("x".repeat(40), false), { catalog, payments: paypal.payments, publicUrl: "http://x" }));
    const http = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => http.once("listening", resolve));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    try {
      expect(await (await fetch(`${base}/api/shop/status`)).json()).toEqual({ search: false });
      const response = await fetch(`${base}/api/shop/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "shoes" }),
      });
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe("search_not_configured");
    } finally {
      http.close();
    }
  });
});

describe("POST /api/shop/search", () => {
  it("passes text, image, filters and page token through and returns the next page token", async () => {
    const response = await post("/api/shop/search", {
      query: "trail shoes",
      imageUrl: "https://img.example/shoe.jpg",
      filters: { price: { max_price: 100 } },
      pageToken: "tok",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.products.map((p: Product) => p.id)).toEqual(["p1", "p2"]);
    expect(body.products[0].offers[0].url).toBe("https://go.trychannel3.com/p1");
    expect(body.nextPageToken).toBeNull();
    expect(fake.searches.at(-1)).toMatchObject({
      query: "trail shoes",
      imageUrl: "https://img.example/shoe.jpg",
      filters: { price: { max_price: 100 } },
      pageToken: "tok",
    });
  });

  it("accepts a base64 photo larger than the 16kb auth body limit", async () => {
    const base64Image = "A".repeat(200_000);
    const response = await post("/api/shop/search", { base64Image });
    expect(response.status).toBe(200);
    expect(fake.searches.at(-1)!.base64Image).toHaveLength(200_000);
  });

  it("attributes searches to the signed-in user", async () => {
    await post("/api/shop/search", { query: "socks" }, { cookie });
    expect(fake.searches.at(-1)!.userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a search with nothing to search for", async () => {
    const response = await post("/api/shop/search", { query: "  " });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });
});

describe("POST /api/shop/lookup", () => {
  it("returns a product from the requested link and attributes it to the signed-in user", async () => {
    const response = await post("/api/shop/lookup", { url: "https://shop.example/product" }, { cookie });
    expect(response.status).toBe(200);
    expect((await response.json()).product.id).toBe("lookup-result");
    expect(fake.lookups.at(-1)).toMatchObject({ url: "https://shop.example/product", userId: expect.any(String) });
  });

  it("returns 404 for unknown links and rejects non-http URLs", async () => {
    expect((await post("/api/shop/lookup", { url: "https://shop.example/missing" })).status).toBe(404);
    expect((await post("/api/shop/lookup", { url: "ftp://shop.example/product" })).status).toBe(400);
  });
});

describe("product pages", () => {
  it("returns the full product with its price history", async () => {
    const body = await (await fetch(`${server.baseUrl}/api/shop/products/p1`)).json();
    expect(body.product.id).toBe("p1");
    expect(body.priceHistory.canonical_product_id).toBe("p1");
    expect(body.priceHistory.history[0].timestamp).toBe("2026-10-01T00:00:00.000Z");
  });

  it("404s an unknown product", async () => {
    expect((await fetch(`${server.baseUrl}/api/shop/products/missing`)).status).toBe(404);
  });

  it("re-fetches the product for a variant selection", async () => {
    const response = await post("/api/shop/products/p1/resolve", { selection: { Color: "Navy", Size: "10" } });
    expect((await response.json()).product.title).toBe("Product p1 Navy/10");
    expect(fake.resolves.at(-1)).toEqual({ id: "p1", selection: { Color: "Navy", Size: "10" } });
  });

  it("returns similar products", async () => {
    const body = await (await post("/api/shop/similar", { productId: "p1", limit: 4 })).json();
    expect(body.products.map((p: Product) => p.id)).toEqual(["p1-like"]);
  });

  it("looks up brands for the filter bar", async () => {
    expect(await (await fetch(`${server.baseUrl}/api/shop/brands?q=nike`)).json()).toEqual({ brands: [{ id: "b1", name: "nike" }] });
  });
});

describe("POST /api/shop/checkout", () => {
  it("needs a session", async () => {
    expect((await post("/api/shop/checkout", { productId: "p1" })).status).toBe(401);
  });

  it("starts a PayPal checkout for the chosen variant at the catalog's price", async () => {
    const response = await post("/api/shop/checkout", { productId: "p1", options: { Color: "Navy", Size: "10" } }, { cookie });
    expect(response.status).toBe(201);
    const { order } = await response.json();
    expect(order.approveUrl).toMatch(/^https:\/\/sandbox\.paypal\.test\//);
    expect(catalogGets.at(-1)).toEqual({ id: "p1", options: { Color: "Navy", Size: "10" } });
    const [row] = await server.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.totalCents).toBe(4200);
    expect(row!.items).toEqual([
      { productId: "p1", title: "Trail Runner (Navy / 10)", quantity: 1, unitCents: 4200, merchant: "shop.example", options: { Color: "Navy", Size: "10" } },
    ]);
    expect(paypal.created.at(-1)!.lines[0]!.title).toBe("Trail Runner (Navy / 10)");
  });

  it("refuses a product Channel3 no longer has", async () => {
    const response = await post("/api/shop/checkout", { productId: "missing" }, { cookie });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("product_not_found");
  });
});
