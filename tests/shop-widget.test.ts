import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoCatalog } from "../src/project/channel3/demo-catalog.js";
import type { Product } from "../src/project/services.js";
import { SHOP_WIDGET_URI } from "../src/project/ui/resource.js";
import { renderShopWidgetHtml } from "../src/project/ui/shop-widget.js";
import { callTool, issueAccessToken, mcpCall, signUp, startServer, type TestServer } from "./helpers/harness.js";

const IMAGE_SECRET = "image-secret-image-secret-image-secret";

const products: Product[] = [
  {
    id: "p_mug",
    title: "Blue Mug",
    brand: "Kiln",
    description: "A blue ceramic mug",
    imageUrl: "https://cdn.merchant.example/mug.jpg",
    priceCents: 1_500,
    currency: "USD",
    merchant: "merchant.example",
    inStock: true,
  },
  {
    id: "p_lamp",
    title: "Desk Lamp",
    brand: "Lumen",
    imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c",
    priceCents: 4_000,
    compareAtCents: 5_000,
    currency: "USD",
    inStock: true,
  },
  { id: "p_pricey", title: "Pricey Blue Lamp", priceCents: 90_000, currency: "USD", inStock: false },
];

const searches: { query: string; options: unknown }[] = [];
const demo = createDemoCatalog(products);
let failSearch = false;
const catalog = {
  search: async (query: string, options?: Record<string, unknown>) => {
    if (failSearch) throw new Error("Channel3 search failed: HTTP 500");
    searches.push({ query, options });
    return demo.search(query, options);
  },
  get: demo.get,
};

let server: TestServer;
let token: string;
let browseless: string;
beforeAll(async () => {
  server = await startServer({ catalog, imageSecret: IMAGE_SECRET });
  const { userId } = await signUp(server.baseUrl, "shopper");
  token = (await issueAccessToken(server.db, server.baseUrl, userId)).token;
  browseless = (await issueAccessToken(server.db, server.baseUrl, userId, ["orders:read"])).token;
});
afterAll(() => server.close());

describe("renderShopWidgetHtml", () => {
  const html = renderShopWidgetHtml();

  it("is a full, self-contained HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).toContain('<script type="module">');
    // the bundle's App class is inlined, not imported
    expect(html).not.toMatch(/^\s*import\s/m);
    expect(html).toContain("ui/initialize");
    expect(html.length).toBeGreaterThan(100_000);
  });

  it("calls the checkout tools and uses the App APIs", () => {
    for (const needle of ["create_checkout", "get_order_status", "callServerTool", "openLink", "ontoolresult", "ontoolinput", "updateModelContext", "app.connect()", "#ffc439", "#0070e0", "prefers-color-scheme"]) {
      expect(html, needle).toContain(needle);
    }
  });

  it("only closes the script tag where it means to", () => {
    expect(html.match(/<\/script>/gi)?.length).toBe(1);
  });
});

describe("shop widget resource over /mcp", () => {
  it("is listed in resources/list", async () => {
    const result = await mcpCall(server.baseUrl, token, "resources/list");
    const resource = result.resources.find((r: { uri: string }) => r.uri === SHOP_WIDGET_URI);
    expect(resource).toBeDefined();
    expect(resource.mimeType).toBe("text/html;profile=mcp-app");
  });

  it("is readable with the MCP Apps mime type and an image CSP", async () => {
    const result = await mcpCall(server.baseUrl, token, "resources/read", { uri: SHOP_WIDGET_URI });
    const [content] = result.contents;
    expect(content.uri).toBe(SHOP_WIDGET_URI);
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toBe(renderShopWidgetHtml());
    const domains: string[] = content._meta.ui.csp.resourceDomains;
    expect(domains).toContain("https://images.unsplash.com");
    expect(domains).toContain(new URL(server.baseUrl).origin);
  });
});

describe("catalog tools over /mcp", () => {
  it("tools/list shows the UI resource on search_products", async () => {
    const { tools } = await mcpCall(server.baseUrl, token, "tools/list");
    const search = tools.find((t: { name: string }) => t.name === "search_products");
    expect(search._meta.ui.resourceUri).toBe(SHOP_WIDGET_URI);
    expect(search._meta["ui/resourceUri"]).toBe(SHOP_WIDGET_URI);
    expect(search.description).toMatch(/PayPal/);
    expect(Object.keys(search.inputSchema.properties).sort()).toEqual(["image_url", "limit", "max_price", "query"]);
    expect(tools.find((t: { name: string }) => t.name === "get_product")).toBeDefined();
  });

  it("search_products returns products, with merchant images proxied and a text summary", async () => {
    const { data, isError, raw } = await callTool(server.baseUrl, token, "search_products", { query: "blue", max_price: 100 });
    expect(isError).toBe(false);
    expect(data.query).toBe("blue");
    expect(data.products.map((p: Product) => p.id)).toEqual(["p_mug"]);
    expect(searches.at(-1)).toEqual({ query: "blue", options: { limit: 8, maxPriceCents: 10_000 } });

    const proxied = new URL(data.products[0].imageUrl);
    expect(proxied.origin).toBe(new URL(server.baseUrl).origin);
    expect(proxied.pathname).toBe("/img");
    expect(proxied.searchParams.get("u")).toBe("https://cdn.merchant.example/mug.jpg");

    const text = raw.content.map((c: { text: string }) => c.text).join("\n");
    expect(text).toContain("Blue Mug");
    expect(text).toContain("$15.00");
    expect(text).toContain("p_mug");
  });

  it("keeps unsplash images as they are, and respects limit", async () => {
    const { data } = await callTool(server.baseUrl, token, "search_products", { query: "lamp", limit: 1 });
    expect(data.products).toHaveLength(1);
    expect(data.products[0].imageUrl).toBe("https://images.unsplash.com/photo-1507473885765-e6ed057f782c");
    expect(searches.at(-1)!.options).toEqual({ limit: 1 });
  });

  it("validates arguments", async () => {
    const { isError } = await callTool(server.baseUrl, token, "search_products", { query: "x", limit: 50 });
    expect(isError).toBe(true);
  });

  it("get_product returns one product, or product_not_found", async () => {
    const found = await callTool(server.baseUrl, token, "get_product", { product_id: "p_lamp" });
    expect(found.isError).toBe(false);
    expect(found.data.product).toMatchObject({ id: "p_lamp", priceCents: 4_000, compareAtCents: 5_000 });
    const missing = await callTool(server.baseUrl, token, "get_product", { product_id: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.data.code).toBe("product_not_found");
  });

  it("needs the shop:browse scope", async () => {
    for (const [name, args] of [
      ["search_products", { query: "mug" }],
      ["get_product", { product_id: "p_mug" }],
    ] as const) {
      const { data, isError } = await callTool(server.baseUrl, browseless, name, args);
      expect(isError).toBe(true);
      expect(data).toEqual({ code: "insufficient_scope", required: "shop:browse" });
    }
  });

  it("reports catalog failures as tool errors", async () => {
    failSearch = true;
    try {
      const { data, isError } = await callTool(server.baseUrl, token, "search_products", { query: "x" });
      expect(isError).toBe(true);
      expect(data.code).toBe("catalog_unavailable");
    } finally {
      failSearch = false;
    }
  });

  it("logs tool activity", async () => {
    const { data } = await callTool(server.baseUrl, token, "get_activity", {});
    const tools = data.activity.map((a: { tool: string }) => a.tool);
    expect(tools).toContain("search_products");
    expect(tools).toContain("get_product");
  });
});
