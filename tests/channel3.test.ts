import { describe, expect, it, vi } from "vitest";
import { createChannel3Catalog } from "../src/project/channel3/client.js";

const API_KEY = "sk_test_secret_key_123";

const rawProduct = {
  id: "prod_abc",
  title: "Trail Runner 2",
  description: "A light trail running shoe.",
  brands: [{ id: "b1", name: "Northpeak" }, { id: "b2", name: "Other" }],
  images: [
    { url: "https://cdn.shop.example/side.jpg", is_main_image: false },
    { url: "https://cdn.shop.example/main.jpg", is_main_image: true },
  ],
  offers: [
    {
      url: "https://pricey.example/p/1",
      domain: "pricey.example",
      price: { price: 129.99, compare_at_price: 149.99, currency: "USD" },
      availability: "InStock",
    },
    {
      url: "https://cheap-oos.example/p/1",
      domain: "cheap-oos.example",
      price: { price: 79.5, compare_at_price: null, currency: "USD" },
      availability: "OutOfStock",
    },
    {
      url: "https://good.example/p/1",
      domain: "good.example",
      price: { price: 99.99, compare_at_price: 119.99, currency: "USD" },
      availability: "InStock",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {}));
}

describe("Channel3 catalog", () => {
  it("searches with the right URL, headers and body, and normalises products", async () => {
    const fetch = mockFetch(() => jsonResponse({ products: [rawProduct], next_page_token: null }));
    const catalog = createChannel3Catalog({ apiKey: API_KEY, fetch });
    const products = await catalog.search("trail shoes", { limit: 5, maxPriceCents: 15_000, minPriceCents: 2_550 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.trychannel3.com/v1/search");
    expect(init!.method).toBe("POST");
    const headers = new Headers(init!.headers);
    expect(headers.get("x-api-key")).toBe(API_KEY);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init!.body))).toEqual({
      query: "trail shoes",
      limit: 5,
      filters: { price: { min_price: 25.5, max_price: 150 }, availability: ["InStock"] },
      config: { country: "US", currency: "USD" },
    });

    expect(products).toEqual([
      {
        id: "prod_abc",
        title: "Trail Runner 2",
        brand: "Northpeak",
        description: "A light trail running shoe.",
        imageUrl: "https://cdn.shop.example/main.jpg",
        priceCents: 9_999,
        currency: "USD",
        compareAtCents: 11_999,
        merchant: "good.example",
        merchantUrl: "https://good.example/p/1",
        inStock: true,
      },
    ]);
  });

  it("clamps the limit to 1..12 and omits price filters that aren't set", async () => {
    const fetch = mockFetch(() => jsonResponse({ products: [] }));
    const catalog = createChannel3Catalog({ apiKey: API_KEY, fetch, baseUrl: "https://c3.test/" });
    await catalog.search("a", { limit: 50 });
    await catalog.search("b", { limit: 0 });
    await catalog.search("c");
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)));
    expect(String(fetch.mock.calls[0]![0])).toBe("https://c3.test/v1/search");
    expect(bodies.map((b) => b.limit)).toEqual([12, 1, 8]);
    expect(bodies[0].filters).toEqual({ availability: ["InStock"] });
  });

  it("falls back to the cheapest offer (out of stock) and the first image", async () => {
    const fetch = mockFetch(() =>
      jsonResponse({
        products: [
          {
            id: "p2",
            title: "Lamp",
            brands: [],
            images: [{ url: "https://img.example/a.jpg" }, { url: "https://img.example/b.jpg" }],
            offers: [
              { url: "https://a.example", domain: "a.example", price: { price: 40, currency: "USD" }, availability: "OutOfStock" },
              { url: "https://b.example", domain: "b.example", price: { price: 35, currency: "USD" }, availability: "OutOfStock" },
            ],
          },
        ],
      })
    );
    const [product] = await createChannel3Catalog({ apiKey: API_KEY, fetch }).search("lamp");
    expect(product).toMatchObject({
      id: "p2",
      imageUrl: "https://img.example/a.jpg",
      priceCents: 3_500,
      merchant: "b.example",
      inStock: false,
    });
    expect(product!.brand).toBeUndefined();
    expect(product!.compareAtCents).toBeUndefined();
  });

  it("skips products without any offer", async () => {
    const fetch = mockFetch(() => jsonResponse({ products: [{ id: "x", title: "No offers", offers: [] }, rawProduct] }));
    const products = await createChannel3Catalog({ apiKey: API_KEY, fetch }).search("x");
    expect(products.map((p) => p.id)).toEqual(["prod_abc"]);
  });

  it("gets one product by id, and returns undefined on 404", async () => {
    const fetch = mockFetch((url) =>
      url.endsWith("/v1/products/prod_abc") ? jsonResponse(rawProduct) : jsonResponse({ detail: "Not found" }, 404)
    );
    const catalog = createChannel3Catalog({ apiKey: API_KEY, fetch });
    const product = await catalog.get("prod_abc");
    expect(product?.priceCents).toBe(9_999);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.trychannel3.com/v1/products/prod_abc");
    expect(new Headers(init!.headers).get("x-api-key")).toBe(API_KEY);
    expect(await catalog.get("missing")).toBeUndefined();
  });

  it("encodes the product id in the path", async () => {
    const fetch = mockFetch(() => jsonResponse({ detail: "Not found" }, 404));
    await createChannel3Catalog({ apiKey: API_KEY, fetch }).get("a/b?c");
    expect(fetch.mock.calls[0]![0]).toBe("https://api.trychannel3.com/v1/products/a%2Fb%3Fc");
  });

  it("throws a useful error on non-2xx without leaking the API key", async () => {
    const fetch = mockFetch(() => new Response(`{"detail":"bad key ${API_KEY}"}`, { status: 401 }));
    const catalog = createChannel3Catalog({ apiKey: API_KEY, fetch });
    const error = await catalog.search("x").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Channel3.*401/);
    expect((error as Error).message).not.toContain(API_KEY);
    const getError = await catalog.get("y").catch((e: Error) => e);
    expect((getError as Error).message).toMatch(/401/);
  });

  it("wraps network failures", async () => {
    const fetch = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(createChannel3Catalog({ apiKey: API_KEY, fetch }).search("x")).rejects.toThrow(/Channel3/);
  });
});

describe("Channel3 catalog without an API key", () => {
  const catalog = createChannel3Catalog({ fetch: vi.fn() as unknown as typeof fetch });

  it("reports the missing API key instead of using mock products", async () => {
    await expect(catalog.search("shoes")).rejects.toThrow(
      "Product search isn't configured on this server (CHANNEL3_API_KEY missing)"
    );
    expect(await catalog.get("missing")).toBeUndefined();
  });
});
