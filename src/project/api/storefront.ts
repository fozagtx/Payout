import express, { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { SearchFilters } from "@channel3/sdk/resources";
import type { Database } from "../../db/client.js";
import { MAX_QUANTITY, OrderError, createCheckout, orderView } from "../orders.js";
import type { Services } from "../services.js";
import type { AppSession } from "../session.js";

/**
 * The web storefront's JSON API. The browser never sees CHANNEL3_API_KEY:
 * these routes call Channel3 and return full SDK objects for the Channel3 UI.
 *
 *   GET  /api/shop/status                    → { search: boolean }
 *   POST /api/shop/search                    { query?, imageUrl?, base64Image?, filters?, pageToken? } → { products, nextPageToken }
 *   GET  /api/shop/products/:id              → { product, priceHistory }
 *   POST /api/shop/products/:id/resolve      { selection } → { product } (variant re-fetch)
 *   POST /api/shop/similar                   { productId, limit?, filters? } → { products }
 *   GET  /api/shop/brands|websites|categories?q=…  → { brands | websites | categories }
 *   GET  /api/shop/categories/:slug          → { category }
 *   POST /api/shop/checkout                  { productId, quantity?, options? } → { order } (signed in)
 */

const MAX_BASE64_IMAGE = 6 * 1024 * 1024;

const filters = z.record(z.string(), z.unknown()).optional();
const options = z.record(z.string().min(1).max(100), z.string().min(1).max(200));

const searchBody = z
  .object({
    query: z.string().trim().max(500).optional(),
    imageUrl: z.url({ protocol: /^https?$/ }).max(2048).optional(),
    base64Image: z.string().max(MAX_BASE64_IMAGE).optional(),
    filters,
    pageToken: z.string().max(2048).optional(),
  })
  .refine((body) => Boolean(body.query || body.imageUrl || body.base64Image || body.pageToken), {
    message: "Type something to search for, or add a photo.",
  });

const similarBody = z.object({
  productId: z.string().min(1).max(512),
  limit: z.number().int().min(1).max(24).optional(),
  filters,
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

export function createStorefrontRouter(db: Database, session: AppSession, services: Services) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
  // Mounted before the auth router's 16kb JSON parser: photo searches carry the image as base64.
  router.use("/api/shop", limiter, express.json({ limit: "8mb" }));

  function store(response: Response) {
    if (services.storefront) return services.storefront;
    response.status(503).json({
      error: "search_not_configured",
      message: "Product search isn't set up on this server yet: CHANNEL3_API_KEY is missing.",
    });
    return undefined;
  }

  /** Channel3 failures become a short 502; details stay in the server log. */
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
        response.status(502).json({ error: "channel3_error", message: "Channel3 didn't answer just now. Try again in a moment." });
      }
    };

  const userId = (request: express.Request) => session.currentUserId(request) ?? undefined;

  router.get("/api/shop/status", (_request, response) => {
    response.json({ search: Boolean(services.storefront) });
  });

  router.post(
    "/api/shop/search",
    handle(async (request, response) => {
      const parsed = searchBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const storefront = store(response);
      if (!storefront) return;
      const { query, imageUrl, base64Image, pageToken } = parsed.data;
      const page = await storefront.search({
        ...(query ? { query } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(base64Image ? { base64Image } : {}),
        ...(pageToken ? { pageToken } : {}),
        filters: (parsed.data.filters ?? {}) as SearchFilters,
        userId: userId(request),
      });
      response.setHeader("cache-control", "no-store");
      response.json(page);
    })
  );

  router.post(
    "/api/shop/lookup",
    handle(async (request, response) => {
      const parsed = lookupBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const storefront = store(response);
      if (!storefront) return;
      const product = await storefront.lookup(parsed.data.url, userId(request));
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "Channel3 couldn't find that product link in its catalog." });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({ product });
    })
  );

  router.get(
    "/api/shop/products/:id",
    handle(async (request, response) => {
      const storefront = store(response);
      if (!storefront) return;
      const id = String(request.params.id);
      const [product, priceHistory] = await Promise.all([
        storefront.product(id, undefined, userId(request)),
        storefront.priceHistory(id).catch(() => undefined),
      ]);
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "Channel3 doesn't have this product any more." });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({ product, priceHistory: priceHistory ?? null });
    })
  );

  router.post(
    "/api/shop/products/:id/resolve",
    handle(async (request, response) => {
      const parsed = resolveBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const storefront = store(response);
      if (!storefront) return;
      const product = await storefront.product(String(request.params.id), parsed.data.selection, userId(request));
      if (!product) {
        response.status(404).json({ error: "product_not_found", message: "That option isn't available." });
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.json({ product });
    })
  );

  router.post(
    "/api/shop/similar",
    handle(async (request, response) => {
      const parsed = similarBody.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(response, parsed.error);
      const storefront = store(response);
      if (!storefront) return;
      const { productId, limit, filters: similarFilters } = parsed.data;
      const products = await storefront.similar(productId, limit ?? 12, similarFilters as SearchFilters | undefined, userId(request));
      response.json({ products });
    })
  );

  const lookup = (kind: "brands" | "websites" | "categories") =>
    handle(async (request, response) => {
      const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
      const storefront = store(response);
      if (!storefront) return;
      response.json({ [kind]: query ? await storefront[kind](query) : [] });
    });
  router.get("/api/shop/brands", lookup("brands"));
  router.get("/api/shop/websites", lookup("websites"));
  router.get("/api/shop/categories", lookup("categories"));

  router.get(
    "/api/shop/categories/:slug",
    handle(async (request, response) => {
      const storefront = store(response);
      if (!storefront) return;
      const category = await storefront.category(String(request.params.slug));
      if (!category) {
        response.status(404).json({ error: "category_not_found" });
        return;
      }
      response.json({ category });
    })
  );

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
