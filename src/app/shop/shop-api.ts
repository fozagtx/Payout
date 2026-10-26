import type { Brand, Category, CategorySummary, PriceHistoryResponse, Product, Website } from "@channel3/sdk/resources";
import type { SearchFetcher } from "@/hooks/use-product-search.js";
import type { SimilarFetcher } from "@/hooks/use-product-recommendations.js";
import type { VariantResolver } from "@/hooks/use-variant-selection.js";

/** Browser side of /api/shop/*: Channel3 calls run on our server, never with the key in the page. */

export class ShopError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ShopError("Can't reach the server. Check your connection and try again.", 0);
  }
  const data = (await response.json().catch(() => null)) as (T & { message?: string; error?: string }) | null;
  if (!response.ok) throw new ShopError(data?.message ?? "Something went wrong. Please try again.", response.status, data?.error);
  return data as T;
}

/** JSON turns Dates into strings; the price chart needs real Dates back. */
function withDates(history: PriceHistoryResponse | null): PriceHistoryResponse | undefined {
  if (!history) return undefined;
  return { ...history, history: (history.history ?? []).map((point) => ({ ...point, timestamp: new Date(point.timestamp) })) };
}

export const shopStatus = () => request<{ search: boolean }>("/api/shop/status");

export const fetchSearch: SearchFetcher = (input) => request<{ products: Product[]; nextPageToken: string | null }>("/api/shop/search", input);
export const fetchLookup = async (url: string) => (await request<{ product: Product }>("/api/shop/lookup", { url })).product;

export async function fetchProduct(productId: string) {
  const data = await request<{ product: Product; priceHistory: PriceHistoryResponse | null }>(`/api/shop/products/${encodeURIComponent(productId)}`);
  return { product: data.product, priceHistory: withDates(data.priceHistory) };
}

export const resolveVariant: VariantResolver = async ({ product, value, selection }) => {
  const id = value.product_id ?? product.id;
  const data = await request<{ product: Product }>(`/api/shop/products/${encodeURIComponent(id)}/resolve`, {
    selection: value.product_id ? undefined : selection,
  });
  return data.product;
};

export const fetchSimilar: SimilarFetcher = async (input) => (await request<{ products: Product[] }>("/api/shop/similar", input)).products;

const lookup = <K extends string, T>(kind: K) => async (query: string) =>
  (await request<Record<K, T[]>>(`/api/shop/${kind}?q=${encodeURIComponent(query)}`))[kind];

export const searchBrands = lookup<"brands", Brand>("brands");
export const searchWebsites = lookup<"websites", Website>("websites");
export const searchCategories = lookup<"categories", CategorySummary>("categories");
export const getCategory = async (slug: string) => (await request<{ category: Category }>(`/api/shop/categories/${encodeURIComponent(slug)}`)).category;

export const startCheckout = (input: { productId: string; options?: Record<string, string> }) =>
  request<{ order: { id: string; approveUrl: string | null } }>("/api/shop/checkout", input);

export const startWatch = (productId: string) => request<{ watch: { id: string } }>("/api/watches", { productId });
