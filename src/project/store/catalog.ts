import { and, desc, eq, ilike, or, sql, inArray} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Catalog, Product, SearchOptions, SelectedOptions } from "../services.js";
import { products } from "../schema.js";

export type StoreProduct = typeof products.$inferSelect;

/**
 * The merchant's own catalog. Everything the store sells lives in `products`:
 * rows the merchant added by hand or imported from Channel3. Implements the
 * same `Catalog` the tools and checkout use, so repricing and the canvas keep
 * working unchanged.
 */
export function createStoreCatalog(db: Database): Catalog {
  return {
    async search(query: string, options: SearchOptions = {}) {
      const clauses = [eq(products.inStock, true)];
      const term = query.trim();
      if (term) {
        const pattern = `%${escapeLike(term)}%`;
        const text = or(ilike(products.title, pattern), ilike(products.brand, pattern), ilike(products.description, pattern));
        if (text) clauses.push(text);
      }
      if (options.minPriceCents !== undefined) clauses.push(sql`${products.priceCents} >= ${options.minPriceCents}`);
      if (options.maxPriceCents !== undefined) clauses.push(sql`${products.priceCents} <= ${options.maxPriceCents}`);
      const rows = await db
        .select()
        .from(products)
        .where(and(...clauses))
        .orderBy(desc(products.createdAt))
        .limit(Math.min(50, options.limit ?? 20));
      return rows.map(toProduct);
    },

    async get(productId: string, _selected?: SelectedOptions) {
      const row = await getStoreProduct(db, productId);
      return row ? toProduct(row) : undefined;
    },
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function getStoreProduct(db: Database, id: string): Promise<StoreProduct | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row;
}

/** Products whose Channel3 source id is in `ids` — used to map photo/lookup hits onto store items. */
export async function storeProductsByChannel3Ids(db: Database, ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length) return [];
  return db.select().from(products).where(and(eq(products.inStock, true), inArray(products.channel3Id, ids)));
}

/** Other in-stock products: same brand first, then newest. */
export async function similarStoreProducts(db: Database, row: StoreProduct, limit: number): Promise<StoreProduct[]> {
  const others = await db.select().from(products).where(and(eq(products.inStock, true), sql`${products.id} <> ${row.id}`)).orderBy(desc(products.createdAt)).limit(50);
  const score = (candidate: StoreProduct) =>
    (row.brand && candidate.brand === row.brand ? 2 : 0) + (candidate.title.toLowerCase().includes(row.title.split(" ")[0]?.toLowerCase() ?? "") ? 1 : 0);
  return others.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function toProduct(row: StoreProduct): Product {
  return {
    id: row.id,
    title: row.title,
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.imageUrls[0] ? { imageUrl: row.imageUrls[0] } : {}),
    priceCents: row.priceCents,
    currency: row.currency,
    ...(row.compareAtCents && row.compareAtCents > row.priceCents ? { compareAtCents: row.compareAtCents } : {}),
    merchant: "this store",
    ...(row.supplierUrl ? { merchantUrl: row.supplierUrl } : {}),
    inStock: row.inStock,
  };
}

/**
 * A Channel3-shaped product for the web PDP components. The store is the only
 * offer; when the row was imported, the supplier shows up as its own line so
 * buyers can see where the merchant sources it.
 */
export function toChannel3Product(row: StoreProduct, opts?: { selected?: SelectedOptions }) {
  const storeOffer = {
    url: row.supplierUrl ?? "",
    domain: "this store",
    price: {
      price: row.priceCents / 100,
      ...(row.compareAtCents && row.compareAtCents > row.priceCents ? { compare_at_price: row.compareAtCents / 100 } : {}),
      currency: row.currency,
    },
    availability: row.inStock ? ("InStock" as const) : ("OutOfStock" as const),
  };
  const offers = [storeOffer];
  const supplier =
    row.supplierName || row.supplierUrl
      ? {
          name: row.supplierName ?? new URL(row.supplierUrl ?? "https://unknown").hostname,
          url: row.supplierUrl ?? "",
          priceCents: row.supplierCents,
        }
      : null;
  const optionNames = new Set(Object.keys(opts?.selected ?? {}));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    brands: row.brand ? [{ id: row.brand.toLowerCase(), name: row.brand }] : [],
    images: row.imageUrls.map((url, index) => ({ url, is_main_image: index === 0 })),
    offers,
    variants:
      row.options.length || optionNames.size
        ? {
            options: row.options.map((option) => ({
              name: option.name,
              values: option.values.map((value) => ({ label: value, exists: true, available: row.inStock })),
            })),
            selected: Object.entries(opts?.selected ?? {}).map(([name, label]) => ({ name, label })),
          }
        : null,
    key_features: null,
    structured_attributes: {},
    supplier,
    channel3Id: row.channel3Id,
  };
}
