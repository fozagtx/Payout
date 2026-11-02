import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Product } from "@channel3/sdk/resources";
import { createWatchesRouter } from "../src/project/api/watches.js";
import { Channel3ProductProcessingError } from "../src/project/channel3/storefront.js";
import type { Storefront, StorefrontSearch } from "../src/project/channel3/storefront.js";
import { priceWatches, products } from "../src/project/schema.js";
import { createCookieSession } from "../src/project/session.js";
import type { Catalog, Product as CatalogProduct, SelectedOptions } from "../src/project/services.js";
import { callTool, issueAccessToken, signUp, startServer, type TestServer } from "./helpers/harness.js";
import { fakeCatalog, fakePayments } from "./helpers/shop-fakes.js";

const WEBHOOK_SECRET = "whsec_dGVzdC1zZWNyZXQ=";

function sdkProduct(id: string, price = 120): Product {
  return {
    id,
    title: `Product ${id}`,
    images: [{ url: `https://images.example/${id}.jpg`, cleaned_url: `https://images.example/cleaned-${id}.jpg` }],
    offers: [{ url: `https://shop.example/${id}`, domain: "shop.example", price: { price, currency: "USD" }, availability: "InStock" }],
  };
}

const storefrontInputs = {
  product: [] as { id: string; userId?: string }[],
  subscribed: [] as string[],
  unsubscribed: [] as string[],
  subscribeError: undefined as Error | undefined,
  earnings: [] as { userId?: string; days?: number }[],
};

const storefront: Storefront = {
  async search(_input: StorefrontSearch) {
    return { products: [], nextPageToken: null };
  },
  async product(id: string, _options?: SelectedOptions, userId?: string) {
    storefrontInputs.product.push({ id, ...(userId ? { userId } : {}) });
    return id === "missing" ? undefined : sdkProduct(id);
  },
  async priceHistory() {
    return undefined;
  },
  async similar() {
    return [];
  },
  async brands() {
    return [];
  },
  async websites() {
    return [];
  },
  async categories() {
    return [];
  },
  async category() {
    return undefined;
  },
  async lookup() {
    return undefined;
  },
  async subscribe(productId) {
    storefrontInputs.subscribed.push(productId);
    if (storefrontInputs.subscribeError) throw storefrontInputs.subscribeError;
    return `subscription-${productId}`;
  },
  async unsubscribe(subscriptionId) {
    storefrontInputs.unsubscribed.push(subscriptionId);
  },
  async earnings(userId, days) {
    storefrontInputs.earnings.push({ ...(userId ? { userId } : {}), ...(days === undefined ? {} : { days }) });
    return {
      clicks: 12,
      sales: 2,
      transactions: [{ date: "2026-10-01T00:00:00.000Z", merchant: "Shop", saleAmount: 50, commission: 4.5, currency: "USD", status: "PAID" }],
      totals: { sales: 50, commission: 4.5, currency: "USD" },
    };
  },
};

const catalog: Catalog = {
  search: async () => [],
  async get(id) {
    const product: CatalogProduct = { id, title: "Product", priceCents: 100, currency: "USD", inStock: true };
    return product;
  },
};

const paypal = fakePayments();
let server: TestServer;
let alice: { cookie: string; userId: string; token: string };
let bob: { cookie: string; userId: string };

beforeAll(async () => {
  process.env.PAYOUT_ADMIN_USERNAMES = "watcher_a";
  storefrontInputs.product.length = 0;
  storefrontInputs.subscribed.length = 0;
  storefrontInputs.unsubscribed.length = 0;
  storefrontInputs.subscribeError = undefined;
  storefrontInputs.earnings.length = 0;
  server = await startServer(
    { catalog: fakeCatalog(), payments: paypal.payments, storefront },
    { CHANNEL3_WEBHOOK_SECRET: WEBHOOK_SECRET }
  );
  const a = await signUp(server.baseUrl, "watcher_a");
  alice = { ...a, token: (await issueAccessToken(server.db, server.baseUrl, a.userId)).token };
  bob = await signUp(server.baseUrl, "watcher_b");
});
afterAll(() => { delete process.env.PAYOUT_ADMIN_USERNAMES; return server.close(); });

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

async function sendWebhook(id: string, event: unknown, signature?: string) {
  const payload = JSON.stringify(event);
  const date = new Date();
  const webhook = new Webhook(WEBHOOK_SECRET);
  const timestamp = Math.floor(date.getTime() / 1000).toString();
  return fetch(`${server.baseUrl}/channel3/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature ?? webhook.sign(id, date, payload),
    },
    body: payload,
  });
}

describe("/api/watches", () => {
  it("requires a session, stores idempotent subscriptions and unsubscribes only after the last watch", async () => {
    expect((await post("/api/watches", { productId: "p-common" })).status).toBe(401);
    const first = await post("/api/watches", { productId: "p-common", targetPrice: 100 }, alice.cookie);
    expect(first.status).toBe(201);
    const aliceWatch = (await first.json()).watch;
    expect(aliceWatch.subscriptionId).toBe("subscription-p-common");
    expect(storefrontInputs.subscribed).toEqual(["p-common"]);
    const repeated = await post("/api/watches", { productId: "p-common", targetPrice: 50 }, alice.cookie);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).watch).toMatchObject({ id: aliceWatch.id, subscriptionId: "subscription-p-common" });
    expect(storefrontInputs.subscribed).toEqual(["p-common", "p-common"]);

    const bobsWatchResponse = await post("/api/watches", { productId: "p-common" }, bob.cookie);
    expect(bobsWatchResponse.status).toBe(201);
    const bobsWatch = (await bobsWatchResponse.json()).watch;
    expect(bobsWatch.subscriptionId).toBe("subscription-p-common");
    expect(storefrontInputs.subscribed).toEqual(["p-common", "p-common", "p-common"]);
    expect((await (await fetch(`${server.baseUrl}/api/watches`, { headers: { cookie: bob.cookie } })).json()).watches).toHaveLength(1);
    expect((await (await fetch(`${server.baseUrl}/api/watches`, { headers: { cookie: alice.cookie } })).json()).watches).toHaveLength(1);

    expect((await fetch(`${server.baseUrl}/api/watches/${bobsWatch.id}`, { method: "DELETE", headers: { cookie: alice.cookie } })).status).toBe(404);
    expect(storefrontInputs.unsubscribed).toEqual([]);
    expect((await fetch(`${server.baseUrl}/api/watches/${aliceWatch.id}`, { method: "DELETE", headers: { cookie: alice.cookie } })).status).toBe(200);
    expect(storefrontInputs.unsubscribed).toEqual([]);
    expect((await fetch(`${server.baseUrl}/api/watches/${bobsWatch.id}`, { method: "DELETE", headers: { cookie: bob.cookie } })).status).toBe(200);
    expect(storefrontInputs.unsubscribed).toEqual(["subscription-p-common"]);
  });

  it("returns 409 and removes the watch while Channel3 is processing the product", async () => {
    storefrontInputs.subscribeError = new Channel3ProductProcessingError();
    try {
      const response = await post("/api/watches", { productId: "p-processing" }, alice.cookie);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "product_processing",
        message: "Channel3 is still processing this product — try again in a minute",
      });
      expect(await server.db.select().from(priceWatches).where(eq(priceWatches.productId, "p-processing"))).toEqual([]);
    } finally {
      storefrontInputs.subscribeError = undefined;
    }
  });
});

describe("POST /channel3/webhook", () => {
  it("returns 503 when the signing secret is missing", async () => {
    const app = express().use(
      createWatchesRouter(
        server.db,
        createCookieSession("test-secret-test-secret-test-secret-123", false),
        { catalog, payments: paypal.payments, storefront, publicUrl: server.baseUrl }
      )
    );
    const http = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => http.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/channel3/webhook`, { method: "POST", body: "{}" });
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe("channel3_webhook_not_configured");
    } finally {
      await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects a bad signature, updates price and stock alerts, and ignores a duplicate event id", async () => {
    const created = await post("/api/watches", { productId: "p-alert", targetPrice: 100 }, alice.cookie);
    expect(created.status).toBe(201);
    const watch = (await created.json()).watch;
    const priceEvent = {
      type: "offer.price.changed",
      data: {
        subject: { product_id: "p-alert", domain: "shop.example" },
        current: { price: 95, currency: "USD" },
      },
    };
    expect((await sendWebhook("msg-bad", priceEvent, "v1,invalid")).status).toBe(400);

    const priceResponse = await sendWebhook("msg-price", priceEvent);
    expect(priceResponse.status).toBe(200);
    expect((await priceResponse.json()).duplicate).toBe(false);
    let [row] = await server.db.select().from(priceWatches).where(eq(priceWatches.id, watch.id));
    expect(row).toMatchObject({ lastCents: 9500, lastInStock: true });
    expect(row!.alert).toContain("Price dropped");
    const firstAlert = row!.alert;

    const priceRise = await sendWebhook("msg-price-rise", {
      type: "offer.price.changed",
      data: {
        subject: { product_id: "p-alert", domain: "shop.example" },
        current: { price: 99, currency: "USD" },
      },
    });
    expect(priceRise.status).toBe(200);
    [row] = await server.db.select().from(priceWatches).where(eq(priceWatches.id, watch.id));
    expect(row).toMatchObject({ lastCents: 9900, alert: firstAlert });

    const duplicate = await sendWebhook("msg-price", {
      type: "offer.price.changed",
      data: {
        subject: { product_id: "p-alert", domain: "shop.example" },
        current: { price: 10, currency: "USD" },
      },
    });
    expect((await duplicate.json()).duplicate).toBe(true);
    [row] = await server.db.select().from(priceWatches).where(eq(priceWatches.id, watch.id));
    expect(row!.lastCents).toBe(9900);

    await sendWebhook("msg-stock-out", {
      type: "offer.availability.changed",
      data: { subject: { product_id: "p-alert", domain: "shop.example" }, current: "OutOfStock" },
    });
    const backInStock = await sendWebhook("msg-stock-in", {
      type: "offer.availability.changed",
      data: { subject: { product_id: "p-alert", domain: "shop.example" }, current: "InStock" },
    });
    expect(backInStock.status).toBe(200);
    [row] = await server.db.select().from(priceWatches).where(eq(priceWatches.id, watch.id));
    expect(row).toMatchObject({ lastInStock: true });
    expect(row!.alert).toContain("back in stock");

    const legacyPrice = await sendWebhook("msg-legacy-price", {
      type: "price.changed",
      canonical_product_id: "p-alert",
      domain: "legacy.example",
      new_price: 80,
      currency: "USD",
    });
    expect(legacyPrice.status).toBe(200);
    [row] = await server.db.select().from(priceWatches).where(eq(priceWatches.id, watch.id));
    expect(row).toMatchObject({ lastCents: 8000, currency: "USD" });
    expect(row!.alert).toContain("legacy.example");
  });
});

describe("Channel3 earnings and MCP watch tools", () => {
  it("returns order revenue with no Channel3 section when Channel3 isn't configured", async () => {
    const app = express().use(
      createWatchesRouter(
        server.db,
        createCookieSession("test-secret-test-secret-test-secret-123", false),
        { catalog, payments: paypal.payments, publicUrl: server.baseUrl },
        WEBHOOK_SECRET
      )
    );
    const http = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => http.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/api/earnings`, { headers: { cookie: alice.cookie } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.channel3).toBeNull();
    expect(body.revenue).toMatchObject({ orders: 0, currency: "USD" });
    } finally {
      await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("requires a session and returns the signed-in user's earnings", async () => {
    expect((await fetch(`${server.baseUrl}/api/earnings`)).status).toBe(401);
    const response = await fetch(`${server.baseUrl}/api/earnings?days=14`, { headers: { cookie: alice.cookie } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.channel3).toMatchObject({ clicks: 12, sales: 2, totals: { sales: 50, commission: 4.5, currency: "USD" } });
    expect(body.revenue).toMatchObject({ currency: "USD" });
    expect(storefrontInputs.earnings.at(-1)).toEqual({  userId: undefined, days: 14 });
    expect((await fetch(`${server.baseUrl}/api/earnings?days=91`, { headers: { cookie: alice.cookie } })).status).toBe(400);
  });

  it("creates a price watch and lists it through MCP", async () => {
    await server.db.insert(products).values({ title: "Watched Shoe", priceCents: 12000, currency: "USD", channel3Id: "p-mcp" });
    const created = await callTool(server.baseUrl, alice.token, "watch_price", { product_id: "p-mcp", target_price: 90 });
    expect(created.isError).toBe(false);
    expect(created.data.watch).toMatchObject({
      productId: "p-mcp",
      targetCents: 9000,
      startCents: 12000,
      subscriptionId: "subscription-p-mcp",
    });
    expect(storefrontInputs.subscribed).toContain("p-mcp");
    const listed = await callTool(server.baseUrl, alice.token, "list_price_watches", {});
    expect(listed.isError).toBe(false);
    expect(listed.data.watches).toEqual(expect.arrayContaining([expect.objectContaining({ productId: "p-mcp" })]));
  });
});
