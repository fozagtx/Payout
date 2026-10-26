"use client";

import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Product } from "@channel3/sdk/resources";
import { ProductSearch } from "@/components/product-search.js";
import type { SearchFetcher } from "@/hooks/use-product-search.js";
import { Footer, Header } from "@/components/Header.js";
import { AlertIcon } from "@/components/Icons.js";
import { ProductView } from "./ProductView.js";
import { fetchLookup, fetchSearch, getCategory, searchBrands, searchCategories, searchWebsites, ShopError, shopStatus } from "./shop-api.js";

const productFromUrl = () => new URLSearchParams(window.location.search).get("product");

function ShopPage() {
  const status = useQuery({ queryKey: ["shop-status"], queryFn: shopStatus });
  const [productId, setProductId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setProductId(productFromUrl());
    const onPop = () => setProductId(productFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((product: Product) => {
    // depth = product pages opened since the grid, so "Back to results" can jump straight back to it.
    const depth = (window.history.state?.shopDepth ?? 0) + 1;
    window.history.pushState({ shopDepth: depth }, "", `/shop?product=${encodeURIComponent(product.id)}`);
    setProductId(product.id);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    const depth = window.history.state?.shopDepth;
    if (typeof depth === "number" && depth > 0) {
      window.history.go(-depth);
    } else {
      window.history.replaceState(null, "", "/shop");
      setProductId(null);
    }
  }, []);

  const search: SearchFetcher = useCallback(async (input) => {
    try {
      const query = input.query?.trim() ?? "";
      if (!input.imageUrl && !input.base64Image && /^https?:\/\//i.test(query)) {
        let product: Product;
        try {
          product = await fetchLookup(query);
        } catch (error) {
          if (error instanceof ShopError && error.status === 404) {
            setSearchError("We couldn't find that product link in Channel3's catalog.");
            return { products: [], nextPageToken: null };
          }
          throw error;
        }
        if (!product) {
          setSearchError("We couldn't find that product link in Channel3's catalog.");
          return { products: [], nextPageToken: null };
        }
        setSearchError(null);
        open(product);
        return { products: [product], nextPageToken: null };
      }
      const page = await fetchSearch(input);
      setSearchError(null);
      return page;
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed.");
      throw error;
    }
  }, [open]);

  const ready = status.data?.search === true;

  return (
    <>
      <Header showNav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          {productId ? <ProductView key={productId} productId={productId} onBack={back} onOpen={open} /> : null}

          {/* The grid stays mounted behind the product page, so "Back" lands on the same results. */}
          <div hidden={productId !== null}>
            <div className="mb-6">
              <p className="eyebrow">Shop</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-[40px] sm:leading-[1.05]">
                Find it, then <span className="mark">pay with PayPal</span>
              </h1>
              <p className="mt-3 max-w-2xl text-ink-soft">
                Search by words or by photo across Channel3’s catalog. Open a product to pick a size or colour, compare stores and check out in
                PayPal Sandbox.
              </p>
            </div>

            {status.isLoading ? null : !ready ? (
              <Notice
                title={status.isError ? "We couldn’t reach the shop" : "Product search isn’t set up yet"}
                body={
                  status.isError
                    ? "The server didn’t answer. Refresh to try again."
                    : "This server has no CHANNEL3_API_KEY. Add it to the server’s environment and restart to turn on search."
                }
              />
            ) : (
              <>
                {searchError ? <Notice title="Search didn’t work" body={searchError} /> : null}
                <ProductSearch
                  fetchSearch={search}
                  searchBrands={searchBrands}
                  searchWebsites={searchWebsites}
                  searchCategories={searchCategories}
                  getCategory={getCategory}
                  filtersLayout="bar"
                  imageSearch
                  placeholder="Search products, paste a store link, or drop in a photo"
                  onSelect={open}
                  locale="en-US"
                />
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
    </div>
  );
}

export function Shop() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } })
  );
  return (
    <QueryClientProvider client={client}>
      <ShopPage />
    </QueryClientProvider>
  );
}
