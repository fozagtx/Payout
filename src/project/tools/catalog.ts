import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod/v4";
import type { Database } from "../../db/client.js";
import { logTool, result } from "../../mcp-kit/index.js";
import { signImageUrl } from "../api/images.js";
import { normaliseProduct } from "../channel3/client.js";
import type { Product, Services } from "../services.js";
import { SHOP_WIDGET_URI } from "../ui/resource.js";
import { renderShopWidgetHtml } from "../ui/shop-widget.js";
import { toolContext } from "./context.js";

/** Image hosts the canvas may load directly; everything else goes through /img. */
const DIRECT_IMAGE_ORIGINS = ["https://images.unsplash.com"];

const UI_META = { ui: { resourceUri: SHOP_WIDGET_URI }, "ui/resourceUri": SHOP_WIDGET_URI };

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const toCatalogProduct = (product: unknown) => normaliseProduct(product as Parameters<typeof normaliseProduct>[0]);

const NO_STOREFRONT = {
  code: "search_not_configured",
  message: "This needs CHANNEL3_API_KEY on the Payout server.",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function registerCatalogTools(server: McpServer, db: Database, services: Services) {
  const publicOrigin = new URL(services.publicUrl).origin;

  /** Merchant CDNs aren't in the canvas CSP, so their images are served through our signed proxy. */
  function forCanvas(product: Product): Product {
    if (!product.imageUrl || !services.imageSecret) return product;
    let origin: string;
    try {
      origin = new URL(product.imageUrl).origin;
    } catch {
      const { imageUrl: _drop, ...rest } = product;
      return rest;
    }
    if (DIRECT_IMAGE_ORIGINS.includes(origin) || origin === publicOrigin) return product;
    return { ...product, imageUrl: signImageUrl(services.publicUrl, services.imageSecret, product.imageUrl) };
  }

  server.registerResource(
    "shop-widget",
    SHOP_WIDGET_URI,
    {
      title: "Payout shop",
      description: "Interactive product grid and PayPal checkout card.",
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: SHOP_WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: renderShopWidgetHtml(),
          _meta: {
            ui: {
              csp: { resourceDomains: [...DIRECT_IMAGE_ORIGINS, publicOrigin], connectDomains: [] },
              prefersBorder: true,
            },
          },
        },
      ],
    })
  );

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search real products from online stores and show them to the user in an interactive product grid " +
        "inside the chat. In that grid the user can select items, choose quantities, and pay with PayPal " +
        "(they approve the payment on PayPal; no money moves without their approval). Call this whenever the " +
        "user wants to shop, browse, find, compare or buy something, e.g. \"find me running shoes under $100\". " +
        "Use a short, concrete search query (product type plus key attributes). Afterwards, briefly comment " +
        "on the results instead of repeating the whole list, since the user already sees the grid.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("What to search for, e.g. \"wireless headphones\"."),
        max_price: z.number().positive().optional().describe("Maximum price per item in US dollars."),
        limit: z.number().int().min(1).max(12).default(8).describe("How many products to show (1-12, default 8)."),
        image_url: z
          .url({ protocol: /^https?$/ })
          .max(2048)
          .optional()
          .describe("A public image URL to search by (photo or screenshot of the item). Combine with query for best results."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "shop:browse");
      if (error) return result(error, true);
      const logged = { query: args.query, max_price: args.max_price, limit: args.limit, image_url: args.image_url };
      if (args.image_url && !services.storefront) {
        return result({ code: "search_not_configured", message: "Image search needs CHANNEL3_API_KEY on the Payout server." }, true);
      }
      let products: Product[];
      try {
        if (args.image_url && services.storefront) {
          const page = await services.storefront.search({
            query: args.query,
            imageUrl: args.image_url,
            filters: { availability: ["InStock"], ...(args.max_price !== undefined ? { price: { max_price: args.max_price } } : {}) },
            userId: context.userId,
          });
          products = page.products.map(toCatalogProduct).filter((p): p is Product => p !== undefined).slice(0, args.limit);
        } else {
          products = await services.catalog.search(args.query, {
            limit: args.limit,
            ...(args.max_price !== undefined ? { maxPriceCents: Math.round(args.max_price * 100) } : {}),
          });
        }
      } catch (caught) {
        const message = errorMessage(caught);
        await logTool(db, context.connectionId, "search_products", logged, "error", message);
        return result({ code: "catalog_unavailable", message: "Product search is unavailable right now. Try again shortly." }, true);
      }
      await logTool(db, context.connectionId, "search_products", logged, "allowed");

      const shown = products.map(forCanvas);
      const lines = products.map((p, index) => {
        const parts = [
          `${index + 1}. ${p.title}`,
          p.brand ? `by ${p.brand}` : undefined,
          formatPrice(p.priceCents, p.currency),
          p.merchant ? `at ${p.merchant}` : undefined,
          p.inStock ? undefined : "(out of stock)",
          `[id: ${p.id}]`,
        ];
        return parts.filter(Boolean).join(" · ");
      });
      const summary =
        products.length === 0
          ? `No products found for "${args.query}". Suggest a broader or different search.`
          : `Found ${products.length} product${products.length === 1 ? "" : "s"} for "${args.query}", shown to the user ` +
            `in an interactive grid where they can select items and pay with PayPal:\n${lines.join("\n")}`;
      const structured = JSON.parse(JSON.stringify({ query: args.query, products: shown })) as Record<string, unknown>;
      return {
        content: [{ type: "text" as const, text: summary }],
        structuredContent: structured,
      };
    }
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description:
        "Look up one product by the id returned from search_products, with its current price, " +
        "availability, merchant and description. Use it to answer questions about a specific product.",
      inputSchema: {
        product_id: z.string().min(1).max(200).describe("The product id from search_products."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "shop:browse");
      if (error) return result(error, true);
      let product: Product | undefined;
      try {
        product = await services.catalog.get(args.product_id);
      } catch (caught) {
        await logTool(db, context.connectionId, "get_product", args, "error", errorMessage(caught));
        return result({ code: "catalog_unavailable", message: "Product lookup is unavailable right now." }, true);
      }
      if (!product) {
        await logTool(db, context.connectionId, "get_product", args, "rejected", "product_not_found");
        return result({ code: "product_not_found", product_id: args.product_id }, true);
      }
      await logTool(db, context.connectionId, "get_product", args, "allowed");
      return result({ product: forCanvas(product) });
    }
  );
  server.registerTool(
    "get_product_details",
    {
      title: "Product details, sizes and store prices",
      description:
        "Full details for one product id: every size/colour option and whether it's in stock, every store selling it " +
        "with price and stock (cheapest first), and the 90-day price history (low, high, typical, and whether today's " +
        "price is a good deal). Pass selected_options (e.g. {\"Size\": \"10\", \"Color\": \"Navy\"}) to get that exact " +
        "variant. Use it before checkout when the product has sizes or colours, and when the user asks which store is " +
        "cheapest or whether it's a good price. Then pass the same options to create_checkout.",
      inputSchema: {
        product_id: z.string().min(1).max(512).describe("Product id from search_products or find_similar_products."),
        selected_options: z.record(z.string().min(1).max(100), z.string().min(1).max(200)).optional().describe("Variant choice, option name to value."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "shop:browse");
      if (error) return result(error, true);
      if (!services.storefront) return result(NO_STOREFRONT, true);
      try {
        const [product, history] = await Promise.all([
          services.storefront.product(args.product_id, args.selected_options, context.userId),
          services.storefront.priceHistory(args.product_id).catch(() => undefined),
        ]);
        if (!product) {
          await logTool(db, context.connectionId, "get_product_details", args, "rejected", "product_not_found");
          return result({ code: "product_not_found", product_id: args.product_id }, true);
        }
        await logTool(db, context.connectionId, "get_product_details", args, "allowed");
        const offers = [...(product.offers ?? [])]
          .sort((a, b) => a.price.price - b.price.price)
          .map((offer) => ({ store: offer.domain, price: offer.price.price, currency: offer.price.currency, availability: offer.availability, url: offer.url }));
        const stats = history?.statistics;
        return result({
          id: product.id,
          title: product.title,
          brand: product.brands?.[0]?.name ?? null,
          options: (product.variants?.options ?? []).map((option) => ({
            name: option.name,
            values: option.values.filter((value) => value.exists).map((value) => ({ value: value.label, availability: value.available ?? null })),
          })),
          selected: product.variants?.selected ?? [],
          offers,
          price_history: stats
            ? { low: stats.min_price, high: stats.max_price, typical: stats.mean, current: stats.current_price, verdict: stats.current_status, currency: stats.currency, days: 90 }
            : null,
        });
      } catch (caught) {
        await logTool(db, context.connectionId, "get_product_details", args, "error", errorMessage(caught));
        return result({ code: "catalog_unavailable", message: "Product details are unavailable right now." }, true);
      }
    }
  );

  server.registerTool(
    "find_similar_products",
    {
      title: "Find similar products",
      description:
        "Show products similar to one product id in the interactive grid, e.g. when the user wants alternatives, " +
        "something cheaper, or more like an item. Optionally cap the price.",
      inputSchema: {
        product_id: z.string().min(1).max(512).describe("The product to find alternatives for."),
        max_price: z.number().positive().optional().describe("Maximum price per item in US dollars."),
        limit: z.number().int().min(1).max(12).default(8).describe("How many products to show (1-12, default 8)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args, extra) => {
      const { context, error } = await toolContext(db, extra.authInfo, "shop:browse");
      if (error) return result(error, true);
      if (!services.storefront) return result(NO_STOREFRONT, true);
      let products: Product[];
      try {
        const similar = await services.storefront.similar(
          args.product_id,
          args.limit,
          { availability: ["InStock"], ...(args.max_price !== undefined ? { price: { max_price: args.max_price } } : {}) },
          context.userId
        );
        products = similar.map(toCatalogProduct).filter((p): p is Product => p !== undefined);
      } catch (caught) {
        await logTool(db, context.connectionId, "find_similar_products", args, "error", errorMessage(caught));
        return result({ code: "catalog_unavailable", message: "Similar products are unavailable right now." }, true);
      }
      await logTool(db, context.connectionId, "find_similar_products", args, "allowed");
      const lines = products.map((p, index) => `${index + 1}. ${p.title} · ${formatPrice(p.priceCents, p.currency)}${p.merchant ? ` at ${p.merchant}` : ""} · [id: ${p.id}]`);
      const summary = products.length
        ? `Found ${products.length} similar product${products.length === 1 ? "" : "s"}, shown in the interactive grid:\n${lines.join("\n")}`
        : "No similar products found. Suggest a different search.";
      return {
        content: [{ type: "text" as const, text: summary }],
        structuredContent: JSON.parse(JSON.stringify({ query: "Similar products", products: products.map(forCanvas) })) as Record<string, unknown>,
      };
    }
  );
}
