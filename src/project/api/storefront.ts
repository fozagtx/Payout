import express, { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { SearchFilters } from "@channel3/sdk/resources";
import { ilike, or, and, eq, sql, desc, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { MAX_QUANTITY, OrderError, createCheckout, orderView } from "../orders.js";
import type { Services } from "../services.js";
import type { AppSession } from "../session.js";
import { products } from "../schema.js";
import { getStoreProduct, similarStoreProducts, storeProductsByChannel3Ids, toChannel3Product } from "../store/catalog.js";

/**
 * The web storefront's JSON API, served from the merchant's own `products`
 * table. Channel3 still backs photo search, paste-a-link research and price
 * history for imported products — the browser never sees CHANNEL3_API_KEY.
 *
 *   GET  /api/shop/status                    → { search: boolean }
 *   POST /api/shop/search                    { query?, imageUrl?, base64Image?, filters? } → { products }
 *   POST /api/shop/lookup                    { url } → { product } (Channel3 research)
 *   GET  /api/shop/products/:id              → { product, priceHistory }
 *   POST /api/shop/products/:id/resolve      { selection } → { product }
 *   POST /api/shop/similar                   { productId, limit? } → { products }
 *   POST /api/shop/checkout                  { productId, quantity?, options? } → { order } (signed in)
 */

const MAX_BASE64_IMAGE = 6 * 1024 * 1024;

const options = z.record(z.string().min(1).max(100), z.string().min(1).max(200));

const searchBody = z.object({
  query: z.string().trim().max(500).optional(),
  imageUrl: z.url({ protocol: /^https?$/ }).max(2048).optional(),
  base64Image: z.string().max(MAX_BASE64_IMAGE).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  pageToken: z.string().max(2048).optional(),
});

const similarBody = z.object({
  productId: z.string().min(1).max(512),
  limit: z.number().int().min(1).max(24).optional(),
});

const resolveBody = z.object({ selection: options.optional() });

const checkoutBody = z.object({
  productId: z.string().min(1).max(512),
  quantity: z.number().int().min(1).max(MAX_QUANTITY).optional(),
  options: options.optional(),
});
const lookupBody = z.object({ url: z.url({ protocol: /^https?$/ }).max(2048) });

function invalid(response: Response, error: z.ZodError) {
  response.status(400).json({ error: "invalid_request", message: error.issues[0]?.message ?? "Invalid request." });
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function createStorefrontRouter(db: Database, session: AppSession, services: Services) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
  router.use("/api/shop", limiter, express.json({ limit: "8mb" }));

  const handle =
    (route: (request: express.Request, response: Response) => Promise<void>) =>
    async (request: express.Request, response: Response, next: express.NextFunction) => {
      try {
        await route(request, response);
      } catch (error) {
        if (error instanceof OrderError) {
          response.status(error.code === "paypal_error" ? 502 : error.code === "paypal_not_configured" ? 503 : 409).json({ error: error.code, ...error.toJSON() });
          return;
        }
        if (response.headersSent) return next(error);
        console.error(`${request.method} ${request.path}`, error instanceof Error ? error.message : error);
        response.status(502).json({ error: "shop_error", message: "The shop didn't answer just now. Try again in a moment." });
      }
    };

  const userId = (request: express.Request) => session.currentUserId(request) ?? undefined;

  /** Text search over the store catalog; empty query lists everything in stock. */
  async function catalogSearch(query: string, filters?: SearchFilters) {
    const clauses = [eq(products.inStock, true)];
    const term = query.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      const text = or(ilike(products.title, pattern), ilike(products.brand, pattern), ilike(products.description, pattern));
      if (text) clauses.push(text);
    }
    const price = filters?.price as { min_price?: number; max_price?: number } | undefined;
    if (price?.min_price !== undefined) clauses.push(sql`${products.priceCents} >= ${Math.round(price.min_price * 100)}`);
    if (price?.max_price !== undefined) clauses.push(sql`${products.priceCents} <= ${Math.round(price.max_price * 100)}`);
    const brandIds = (filters?.brand_ids as string[] | undefined)?.map((id) => id.toLowerCase());
    if (brandIds?.length) clauses.push(inArray(sql`lower(${products.brand})`, brandIds));
    const websiteIds = filters?.website_ids as string[] | undefined;
    if (websiteIds?.length) clauses.push(inArray(products.supplierName, websiteIds));
    return db.select().from(products).where(and(...clauses)).orderBy(desc(products.createdAt)).limit(24);
  }

  router.get("/api/shop/status", async (_request, response) => {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(products);
    response.json({ search: true, products: Number(row?.count ?? 0), imageSearch: Boolean(services.storefront) });
  });

  router.post(
    "/api/shop/search",
    handle(async (request, response) => {
      const parsed = searchBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const { query, imageUrl, base64Image, filters } = parsed.data;

      if (imageUrl || base64Image) {
        // Photo search: Channel3 finds the products, we keep only what this store sells.
        if (!services.storefront) {
          response.status(503).json({ error: "search_not_configured", message: "Photo search isn't available on this store." });
          return;
        }
        const page = await services.storefront.search({ ...(query ? { query } : {}), ...(imageUrl ? { imageUrl } : {}), ...(base64Image ? { base64Image } : {}), userId: userId(request) });
        const mine = await storeProductsByChannel3Ids(db, (page.products ?? []).map((p) => p.id));
        response.setHeader("cache-control", "no-store");
        response.json({ products: mine.map((row) => toChannel3Product(row)), nextPageToken: null });
        return;
      }

      const rows = await catalogSearch(query ?? "", filters as SearchFilters | undefined);
      response.setHeader("cache-control", "no-store");
      response.json({ products: rows.map((row) => toChannel3Product(row)), nextPageToken: null });
    })
  );

  router.post(
    "/api/shop/lookup",
    handle(async (request, response) => {
      const parsed = lookupBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      if (!services.storefront) {
        response.status(503).json({ error: "search_not_configured", message: "Link lookup isn't available on this store." });
        return;
      }
      const product = await services.storefront.lookup(parsed.data.url, userId(request));
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "Couldn't find that product link in the catalog." });
        return;
      }
      // If the store sells the same product, return our row so it stays buyable here.
      const [mine] = await storeProductsByChannel3Ids(db, [product.id]);
      response.setHeader("cache-control", "no-store");
      response.json({ product: mine ? toChannel3Product(mine) : { ...product, research_only: true } });
    })
  );

  router.get(
    "/api/shop/products/:id",
    handle(async (request, response) => {
      const row = await getStoreProduct(db, String(request.params.id));
      if (!row) {
        response.status(404).json({ error: "product_not_found", message: "This product isn't in the store any more." });
        return;
      }
      const priceHistory = row.channel3Id && services.storefront ? await services.storefront.priceHistory(row.channel3Id).catch(() => undefined) : undefined;
      response.setHeader("cache-control", "no-store");
      response.json({ product: toChannel3Product(row), priceHistory: priceHistory ?? null });
    })
  );

  router.post(
    "/api/shop/products/:id/resolve",
    handle(async (request, response) => {
      const parsed = resolveBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const row = await getStoreProduct(db, String(request.params.id));
      if (!row) {
        response.status(404).json({ error: "product_not_found", message: "That option isn't available." });
        return;
      }
      const selection = parsed.data.selection ?? {};
      const invalidOption = Object.entries(selection).find(([name, value]) => !row.options.some((option) => option.name === name && option.values.includes(value)));
      if (invalidOption) {
        response.status(404).json({ error: "product_not_found", message: `We don't have ${invalidOption[1]} in ${invalidOption[0]}.` });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({ product: toChannel3Product(row, { selected: selection }) });
    })
  );

  router.post(
    "/api/shop/similar",
    handle(async (request, response) => {
      const parsed = similarBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const row = await getStoreProduct(db, parsed.data.productId);
      const products = row ? await similarStoreProducts(db, row, parsed.data.limit ?? 12) : [];
      response.json({ products: products.map((other) => toChannel3Product(other)) });
    })
  );

  /** Filter dropdowns: brands and suppliers that exist in this store's catalog. */
  router.get("/api/shop/brands", async (request, response) => {
    const q = typeof request.query.q === "string" ? request.query.q.trim().toLowerCase() : "";
    const rows = await db.selectDistinct({ brand: products.brand }).from(products).where(eq(products.inStock, true));
    const brands = rows
      .map((row) => row.brand)
      .filter((brand): brand is string => Boolean(brand))
      .filter((brand) => !q || brand.toLowerCase().includes(q))
      .map((name) => ({ id: name!.toLowerCase(), name }));
    response.json({ brands });
  });

  router.get("/api/shop/websites", async (request, response) => {
    const q = typeof request.query.q === "string" ? request.query.q.trim().toLowerCase() : "";
    const rows = await db.selectDistinct({ supplier: products.supplierName }).from(products).where(eq(products.inStock, true));
    const websites = rows
      .map((row) => row.supplier)
      .filter((name): name is string => Boolean(name))
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => ({ id: name, name, domain: name }));
    response.json({ websites });
  });

  router.get("/api/shop/categories", async (_request, response) => {
    response.json({ categories: [] });
  });

  router.post(
    "/api/shop/checkout",
    handle(async (request, response) => {
      const id = session.currentUserId(request);
      if (!id) {
        response.status(401).json({ error: "not_signed_in", message: "Log in to pay with PayPal." });
        return;
      }
      const parsed = checkoutBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const { productId, quantity, options: selected } = parsed.data;
      const row = await createCheckout(db, services, {
        userId: id,
        connectionId: null,
        items: [{ product_id: productId, quantity: quantity ?? 1, ...(selected && Object.keys(selected).length ? { options: selected } : {}) }],
      });
      response.status(201).json({ order: orderView(row) });
    })
  );

  return router;
}

// Keep the type used in the page-level search filters.
export type { SearchFilters };
