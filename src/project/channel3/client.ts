import type { Catalog, Product, SearchOptions, SelectedOptions } from "../services.js";
import { createDemoCatalog } from "./demo-catalog.js";

/**
 * Channel3 product search (https://trychannel3.com), with plain fetch.
 * Without an API key it falls back to a built-in demo catalog so the app
 * runs end to end for anyone trying it.
 */

const DEFAULT_BASE_URL = "https://api.trychannel3.com";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;

interface RawOffer {
  url?: string;
  domain?: string;
  price?: { price?: number; compare_at_price?: number | null; currency?: string };
  availability?: string;
}

interface RawProduct {
  id: string;
  title?: string;
  description?: string | null;
  brands?: { id?: string; name?: string }[];
  images?: { url?: string; is_main_image?: boolean }[];
  offers?: RawOffer[];
}

export interface Channel3Options {
  apiKey?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function clampLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

const toCents = (dollars: number) => Math.round(dollars * 100);

/** Channel3's product → ours: cheapest in-stock offer (else cheapest), main image, first brand. */
export function normaliseProduct(raw: RawProduct): Product | undefined {
  const offers = (raw.offers ?? []).filter((offer) => typeof offer.price?.price === "number");
  if (!raw.id || offers.length === 0) return undefined;
  const byPrice = [...offers].sort((a, b) => a.price!.price! - b.price!.price!);
  const offer = byPrice.find((o) => o.availability === "InStock") ?? byPrice[0]!;
  const image = raw.images?.find((i) => i.is_main_image && i.url) ?? raw.images?.find((i) => i.url);
  const priceCents = toCents(offer.price!.price!);
  const compareAt = offer.price?.compare_at_price;
  const brand = raw.brands?.[0]?.name;
  return {
    id: raw.id,
    title: raw.title ?? "Untitled product",
    ...(brand ? { brand } : {}),
    ...(raw.description ? { description: raw.description } : {}),
    ...(image?.url ? { imageUrl: image.url } : {}),
    priceCents,
    currency: offer.price?.currency ?? "USD",
    ...(typeof compareAt === "number" && toCents(compareAt) > priceCents ? { compareAtCents: toCents(compareAt) } : {}),
    ...(offer.domain ? { merchant: offer.domain } : {}),
    ...(offer.url ? { merchantUrl: offer.url } : {}),
    inStock: offer.availability === "InStock",
  };
}

export function createChannel3Catalog(options: Channel3Options = {}): Catalog {
  if (!options.apiKey) return createDemoCatalog();
  const apiKey = options.apiKey;
  const doFetch = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  async function call(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { "x-api-key": apiKey, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Channel3 request failed: ${reason.replaceAll(apiKey, "[redacted]")}`);
    }
    return response;
  }

  async function failure(response: Response, what: string) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200).replaceAll(apiKey, "[redacted]");
    } catch {
      // ignore
    }
    return new Error(`Channel3 ${what} failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return {
    async search(query: string, searchOptions: SearchOptions = {}) {
      const price: Record<string, number> = {};
      if (searchOptions.minPriceCents !== undefined) price.min_price = searchOptions.minPriceCents / 100;
      if (searchOptions.maxPriceCents !== undefined) price.max_price = searchOptions.maxPriceCents / 100;
      const body = {
        query,
        limit: clampLimit(searchOptions.limit),
        filters: { ...(Object.keys(price).length ? { price } : {}), availability: ["InStock"] },
        config: { country: "US", currency: "USD" },
      };
      const response = await call("/v1/search", { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) throw await failure(response, "search");
      const data = (await response.json()) as { products?: RawProduct[] };
      return (data.products ?? []).map(normaliseProduct).filter((p): p is Product => p !== undefined);
    },

    async get(productId: string, selectedOptions: SelectedOptions = {}) {
      const params = new URLSearchParams();
      for (const [name, value] of Object.entries(selectedOptions)) params.set(`option_${name}`, value);
      const query = params.size ? `?${params}` : "";
      const response = await call(`/v1/products/${encodeURIComponent(productId)}${query}`, { method: "GET" });
      if (response.status === 404) return undefined;
      if (!response.ok) throw await failure(response, "product lookup");
      return normaliseProduct((await response.json()) as RawProduct);
    },
  };
}
