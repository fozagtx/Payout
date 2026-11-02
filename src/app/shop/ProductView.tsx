"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PriceHistoryResponse, Product } from "@channel3/sdk/resources";
import { ArrowLeft } from "lucide-react";
import {
  ProductDetailsAttributes,
  ProductDetailsDescription,
  ProductDetailsGallery,
  ProductDetailsHeader,
  ProductDetailsOffers,
  ProductDetailsPriceHistory,
  ProductDetailsRecommendations,
  ProductDetailsRoot,
  ProductDetailsVariants,
} from "@/components/product-details.js";
import { Separator } from "@/components/ui/separator.js";
import { useVariantSelection } from "@/hooks/use-variant-selection.js";
import { formatPrice, isInStock } from "@/lib/format.js";
import { Button } from "@/components/Button.js";
import { PayPalMark, Spinner } from "@/components/Icons.js";
import { fetchProduct, fetchSimilar, resolveVariant, ShopError, startCheckout, startWatch } from "./shop-api.js";

type Props = { productId: string; onBack: () => void; onOpen: (product: Product) => void };

export function ProductView({ productId, onBack, onOpen }: Props) {
  const query = useQuery({ queryKey: ["shop-product", productId], queryFn: () => fetchProduct(productId), staleTime: 0 });

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to results
      </button>
      {query.isLoading ? (
        <div className="flex justify-center py-32 text-muted-foreground" role="status" aria-label="Loading product">
          <Spinner className="h-6 w-6" />
        </div>
      ) : query.isError || !query.data ? (
        <div className="py-24 text-center">
          <p className="text-lg font-semibold text-ink">We couldn’t load this product</p>
          <p className="mt-1 text-sm text-ink-soft">{query.error instanceof Error ? query.error.message : "Try again in a moment."}</p>
          <Button className="mt-5" variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <Details product={query.data.product} priceHistory={query.data.priceHistory} onOpen={onOpen} />
      )}
    </div>
  );
}

function Details({ product: initial, priceHistory, onOpen }: { product: Product; priceHistory?: PriceHistoryResponse; onOpen: (product: Product) => void }) {
  const variants = useVariantSelection({ product: initial, resolve: resolveVariant });
  const { product } = variants;

  return (
    <ProductDetailsRoot
      product={product}
      selection={variants.selection}
      onSelectVariant={variants.select}
      isResolving={variants.isResolving}
      priceHistory={priceHistory}
      buyLinkRel="sponsored noopener noreferrer"
      fetchSimilar={fetchSimilar}
      recommendations={{ title: "Similar products", onSelect: onOpen, limit: 12 }}
      locale="en-US"
    >
      <div className="flex flex-col gap-12">
        <div className="grid gap-8 md:grid-cols-2 md:items-start lg:gap-12">
          <ProductDetailsGallery className="self-start md:sticky md:top-20" />
          <div className="flex flex-col gap-6">
            <ProductDetailsHeader />
            <ProductDetailsVariants />
            {variants.error ? <p className="text-sm text-red-700">That option couldn’t be loaded. Pick another one.</p> : null}
            <PayWithPayPal product={product} selection={variants.selection} resolving={variants.isResolving} />
            <WatchPrice product={product} />
            <ProductDetailsOffers />
            <ProductDetailsDescription />
            <ProductDetailsAttributes />
            {priceHistory?.statistics || (priceHistory?.history?.length ?? 0) > 0 ? (
              <>
                <Separator />
                <ProductDetailsPriceHistory />
              </>
            ) : null}
          </div>
        </div>
        <ProductDetailsRecommendations />
      </div>
    </ProductDetailsRoot>
  );
}

function WatchPrice({ product }: { product: Product }) {
  const [state, setState] = useState<{ busy: boolean; watching: boolean; error?: string }>({ busy: false, watching: false });

  async function watch() {
    setState({ busy: true, watching: false });
    try {
      await startWatch(product.id);
      setState({ busy: false, watching: true });
    } catch (error) {
      if (error instanceof ShopError && error.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(`/shop?product=${product.id}`)}`);
        return;
      }
      setState({ busy: false, watching: false, error: error instanceof Error ? error.message : "Couldn’t start this price watch." });
    }
  }

  return (
    <div>
      {state.watching ? (
        <p className="text-sm font-medium text-emerald-800">Watching — we'll flag drops in your dashboard</p>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => void watch()} loading={state.busy}>
          Watch price
        </Button>
      )}
      {state.error ? <p className="mt-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
    </div>
  );
}

/** PayPal Sandbox checkout for the exact variant on screen, at the cheapest in-stock store's price. */
function PayWithPayPal({ product, selection, resolving }: { product: Product; selection: Record<string, string>; resolving: boolean }) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const best = [...(product.offers ?? [])].filter((offer) => isInStock(offer.availability)).sort((a, b) => a.price.price - b.price.price)[0];
  const usd = best?.price.currency.toUpperCase() === "USD";

  async function pay() {
    setState({ busy: true });
    try {
      const hasOptions = Object.keys(selection).length > 0 && (product.variants?.options.length ?? 0) > 0;
      const { order } = await startCheckout({ productId: product.id, ...(hasOptions ? { options: selection } : {}) });
      if (!order.approveUrl) throw new ShopError("PayPal didn’t return a payment link. Try again.", 502);
      window.location.assign(order.approveUrl);
    } catch (error) {
      if (error instanceof ShopError && error.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(`/shop?product=${product.id}`)}`);
        return;
      }
      setState({ busy: false, error: error instanceof Error ? error.message : "Checkout failed." });
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      {best && usd ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink-soft">
              Best in-stock price: <span className="font-semibold text-ink">{formatPrice(best.price, "en-US")}</span> at {best.domain}
            </p>
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">PayPal Sandbox</span>
          </div>
          <Button variant="paypal" className="mt-3 w-full" onClick={() => void pay()} loading={state.busy} disabled={resolving}>
            {state.busy ? null : <PayPalMark className="h-4 w-4" />} Pay with PayPal
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Test money only. You’ll approve it on PayPal’s sandbox page.</p>
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          {best ? "PayPal checkout only supports USD prices." : "No store has this in stock right now, so PayPal checkout is off."}
        </p>
      )}
      {state.error ? <p className="mt-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
    </div>
  );
}
