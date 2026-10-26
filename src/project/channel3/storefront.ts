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
const PRODUCT_SUBSCRIPTIONS_URL = "https://api.trychannel3.com/v1/product-subscriptions";

export class Channel3ProductProcessingError extends Error {
  constructor() {
    super("Channel3 is still processing this product — try again in a minute");
    this.name = "Channel3ProductProcessingError";
  }
}

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
  lookup(url: string, userId?: string): Promise<Product | undefined>;
  subscribe(productId: string): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  earnings(userId?: string, days?: number): Promise<{
    clicks: number;
    sales: number;
    transactions: { date: string; merchant: string; saleAmount: number; commission: number; currency: string; status: string }[];
    totals: { sales: number; commission: number; currency: string };
  }>;
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
    lookup: async (url, userId) => (await orUndefined(client.products.lookup({ url, ...userHeader(userId) })))?.product,
    async subscribe(productId) {
      const response = await fetch(PRODUCT_SUBSCRIPTIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          product_id: productId,
          events: ["offer.price.changed", "offer.availability.changed"],
        }),
      });
      if (response.status === 409) throw new Channel3ProductProcessingError();
      if (!response.ok) throw new Error(`Channel3 product subscription failed with status ${response.status}`);
      const payload = (await response.json()) as { subscription_id?: unknown };
      if (typeof payload.subscription_id !== "string" || !payload.subscription_id) {
        throw new Error("Channel3 product subscription response didn't include a subscription_id");
      }
      return payload.subscription_id;
    },
    async unsubscribe(subscriptionId) {
      const response = await fetch(`${PRODUCT_SUBSCRIPTIONS_URL}/${encodeURIComponent(subscriptionId)}`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
      if (response.status !== 404 && !response.ok) {
        throw new Error(`Channel3 product unsubscription failed with status ${response.status}`);
      }
    },
    async earnings(userId, days = 30) {
      const windowDays = Math.min(90, Math.max(1, Math.floor(days)));
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const filters = { start_date: startDate, end_date: endDate, ...(userId ? { user_id: userId } : {}) };
      const [clicksPage, transactionsPage] = await Promise.all([
        client.reporting.listClicks({ ...filters, limit: 100 }),
        client.reporting.listTransactions({ ...filters, limit: 100 }),
      ]);
      const transactions = transactionsPage.data.map((transaction) => {
        const extra = transaction as typeof transaction & { currency?: string; merchant?: string; website?: string };
        return {
          date: transaction.purchased_at instanceof Date
            ? transaction.purchased_at.toISOString()
            : new Date(String(transaction.purchased_at)).toISOString(),
          merchant: extra.merchant ?? extra.website ?? transaction.brand_name ?? transaction.product?.title ?? "Unknown merchant",
          saleAmount: transaction.order_amount,
          commission: transaction.commission_amount,
          currency: extra.currency ?? "USD",
          status: transaction.status,
        };
      });
      const summary = transactionsPage.response.summary as
        | (typeof transactionsPage.response.summary & { total_sales?: number; currency?: string })
        | undefined;
      const salesAmount = summary?.total_sales ?? transactions.reduce((sum, transaction) => sum + transaction.saleAmount, 0);
      const currency = summary?.currency ?? transactions[0]?.currency ?? "USD";
      return {
        clicks: clicksPage.response.summary?.total_clicks ?? clicksPage.response.total_count,
        sales: summary?.total_count ?? transactionsPage.response.total_count,
        transactions,
        totals: {
          sales: salesAmount,
          commission: summary?.total_commission ?? transactions.reduce((sum, transaction) => sum + transaction.commission, 0),
          currency,
        },
      };
    },
  };
}
