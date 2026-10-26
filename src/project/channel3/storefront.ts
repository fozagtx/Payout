import { Channel3, Channel3Error } from "@channel3/sdk";
import type {
  Brand,
  Category,
  CategorySummary,
  PriceHistoryResponse,
  Product,
  SearchFilters,
  Website,
} from "@channel3/sdk/resources";
import type { SelectedOptions } from "../services.js";

/**
 * Channel3 for the web storefront, through the official SDK. Unlike the
 * MCP catalog (which normalises products for the chat canvas), this returns
 * full SDK objects, which the Channel3 UI components render as is.
 */

const LOCALE = { country: "US", currency: "USD" } as const;
export const SEARCH_PAGE_SIZE = 24;

export interface StorefrontSearch {
  query?: string;
  imageUrl?: string;
  base64Image?: string;
  filters?: SearchFilters;
  pageToken?: string;
  /** Our user id, so Channel3 attributes clicks and sales to them in reporting. */
  userId?: string;
}

export interface Storefront {
  search(input: StorefrontSearch): Promise<{ products: Product[]; nextPageToken: string | null }>;
  /** Undefined when Channel3 has no such product. */
  product(productId: string, selectedOptions?: SelectedOptions, userId?: string): Promise<Product | undefined>;
  priceHistory(productId: string): Promise<PriceHistoryResponse | undefined>;
  similar(productId: string, limit: number, filters?: SearchFilters, userId?: string): Promise<Product[]>;
  brands(query: string): Promise<Brand[]>;
  websites(query: string): Promise<Website[]>;
  categories(query: string): Promise<CategorySummary[]>;
  category(slug: string): Promise<Category | undefined>;
}

const notFound = (error: unknown) => error instanceof Channel3Error && error.statusCode === 404;

async function orUndefined<T>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (error) {
    if (notFound(error)) return undefined;
    throw error;
  }
}

const userHeader = (userId?: string) => (userId ? { "x-user-id": userId } : {});

export function createStorefront(apiKey: string, client = new Channel3({ apiKey, timeoutInSeconds: 20, maxRetries: 1 })): Storefront {
  return {
    async search(input) {
      const page = await client.products.search({
        ...(input.query ? { query: input.query } : {}),
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...(input.base64Image ? { base64_image: input.base64Image } : {}),
        ...(input.pageToken ? { page_token: input.pageToken } : {}),
        filters: input.filters ?? {},
        limit: SEARCH_PAGE_SIZE,
        config: LOCALE,
        ...userHeader(input.userId),
      });
      return { products: page.data, nextPageToken: page.response.next_page_token ?? null };
    },
    product: (productId, selectedOptions, userId) =>
      orUndefined(
        client.products.retrieve({
          product_id: productId,
          ...LOCALE,
          ...(selectedOptions && Object.keys(selectedOptions).length ? { selected_options: selectedOptions } : {}),
          ...userHeader(userId),
        })
      ),
    priceHistory: (productId) => orUndefined(client.priceTracking.retrieveHistory({ canonical_product_id: productId, days: 90 })),
    async similar(productId, limit, filters, userId) {
      const page = await client.products.findSimilar({ product_id: productId, limit, filters: filters ?? {}, config: LOCALE, ...userHeader(userId) });
      return page.data;
    },
    brands: async (query) => (await client.brands.search({ query, limit: 10, country: "US" })).brands,
    websites: async (query) => (await client.websites.search({ query, limit: 10, country: "US" })).websites,
    categories: async (query) => (await client.categories.search({ query, limit: 10 })).categories,
    category: (slug) => orUndefined(client.categories.retrieve({ slug })),
  };
}
