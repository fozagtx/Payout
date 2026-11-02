"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardBody, CardHeader } from "@/components/Card.js";
import { formatMoney } from "@/components/format.js";
import { Thumb } from "@/components/Thumb.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.js";

type StoreProduct = {
  id: string;
  title: string;
  brand: string | null;
  imageUrls: string[];
  priceCents: number;
  currency: string;
  compareAtCents: number | null;
  inStock: boolean;
  options: { name: string; values: string[] }[];
  channel3Id: string | null;
  supplierName: string | null;
  supplierCents: number | null;
};

type CatalogProduct = {
  id: string;
  title: string;
  brands?: { name?: string }[];
  images?: { url?: string; cleaned_url?: string | null }[];
  offers?: { domain?: string; url?: string; availability?: string; price?: { price?: number; currency?: string } }[];
};

const fieldClass = "block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-[15px] text-ink shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ink focus:ring-4 focus:ring-ink/10";

const emptyForm = { title: "", brand: "", description: "", imageUrl: "", price: "", compareAt: "", options: "" };

function toCents(value: string): number | null {
  const dollars = Number(value);
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
}

export function ProductsCard() {
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<CatalogProduct | null>(null);
  const [importPrice, setImportPrice] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ products: StoreProduct[] }>("/api/merchant/products");
    if (res.ok) {
      setItems(res.data.products);
      setError(null);
    } else {
      setError(res.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const priceCents = toCents(form.price);
    if (!form.title.trim() || !priceCents) {
      setFormError("Give it a title and a price.");
      return;
    }
    setSaving(true);
    const options = form.options
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, values] = part.split(":").map((s) => s.trim());
        return { name: name || "", values: (values || "").split(",").map((v) => v.trim()).filter(Boolean) };
      })
      .filter((o) => o.name && o.values.length);
    const res = await api<{ product: StoreProduct }>("/api/merchant/products", {
      method: "POST",
      body: {
        title: form.title.trim(),
        ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
        priceCents,
        ...(toCents(form.compareAt) ? { compareAtCents: toCents(form.compareAt)! } : {}),
        options,
      },
    });
    setSaving(false);
    if (res.ok) {
      setForm(emptyForm);
      setNotice(`"${res.data.product.title}" is in your store.`);
      void load();
    } else {
      setFormError(res.message);
    }
  }

  async function toggleStock(product: StoreProduct) {
    const res = await api(`/api/merchant/products/${product.id}`, { method: "PATCH", body: { inStock: !product.inStock } });
    if (res.ok) void load();
    else setNotice(res.message);
  }

  async function removeProduct(product: StoreProduct) {
    const res = await api(`/api/merchant/products/${product.id}`, { method: "DELETE" });
    if (res.ok) void load();
    else setNotice(res.message);
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    const res = await api<{ products: CatalogProduct[] }>(`/api/merchant/sourcing?q=${encodeURIComponent(query.trim())}`);
    setSearching(false);
    if (res.ok) setResults(res.data.products);
    else setSearchError(res.message);
  }

  function openImport(product: CatalogProduct) {
    const price = product.offers?.map((o) => o.price?.price).find((p): p is number => typeof p === "number" && p > 0);
    setImportPrice(price ? String(price) : "");
    setImportFor(product);
  }

  async function doImport() {
    if (!importFor) return;
    const priceCents = toCents(importPrice);
    setImporting(importFor.id);
    const res = await api<{ product: StoreProduct }>("/api/merchant/products/import", {
      method: "POST",
      body: { channel3Id: importFor.id, ...(priceCents ? { priceCents } : {}) },
    });
    setImporting(null);
    if (res.ok) {
      setNotice(`"${res.data.product.title}" is in your store at ${formatMoney(res.data.product.priceCents, res.data.product.currency)}.`);
      setImportFor(null);
      void load();
    } else {
      setNotice(res.message);
      setImportFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Add a product" description="Sell something you have. Options like sizes go in as `Size: S, M, L; Colour: Red`." />
        <CardBody>
          <form onSubmit={addProduct} className="grid gap-3 sm:grid-cols-2">
            <input className={`${fieldClass}`} placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className={`${fieldClass}`} placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <input className={`${fieldClass}`} placeholder="Price in USD * (e.g. 24.99)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" />
            <input className={`${fieldClass}`} placeholder="Compare-at price (optional)" value={form.compareAt} onChange={(e) => setForm({ ...form, compareAt: e.target.value })} inputMode="decimal" />
            <input className={`${fieldClass} sm:col-span-2`} placeholder="Photo URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
            <input className={`${fieldClass} sm:col-span-2`} placeholder="Options (Size: S, M, L; Colour: Red, Blue)" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
            <textarea className={`${fieldClass} sm:col-span-2`} placeholder="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {formError ? <p className="text-sm text-red-600 sm:col-span-2">{formError}</p> : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add to store"}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Find products to sell" description="Search the catalog and import items at your price — your store sells them, you ship them." />
        <CardBody>
          <form onSubmit={runSearch} className="flex gap-2">
            <input className={`${fieldClass} flex-1`} placeholder="e.g. running shoes, desk lamp" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={searching}>{searching ? "Searching…" : "Search catalog"}</Button>
          </form>
          {searchError ? <p className="mt-3 text-sm text-red-600">{searchError}</p> : null}
          {results && results.length === 0 ? <p className="mt-3 text-sm text-ink-soft">Nothing found for that search.</p> : null}
          {results && results.length > 0 ? (
            <ul className="mt-4 divide-y divide-ink/10">
              {results.slice(0, 12).map((p) => {
                const offer = p.offers?.find((o) => o.price?.price);
                const image = p.images?.[0]?.cleaned_url ?? p.images?.[0]?.url;
                const already = items.some((item) => item.channel3Id === p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <Thumb src={image} alt={p.title} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                      <p className="truncate text-xs text-ink-soft">
                        {[p.brands?.[0]?.name, offer?.domain, offer?.price?.price ? `$${offer.price.price}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {already ? (
                      <span className="text-xs text-ink-soft">In your store</span>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => openImport(p)}>Sell this</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardBody>
      </Card>

      {notice ? <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink">{notice}</p> : null}

      <Card>
        <CardHeader title="Your catalog" description={items.length ? `${items.length} ${items.length === 1 ? "product" : "products"} — this is what buyers and AI agents see.` : "Nothing here yet — add a product or import one above."} />
        {loading ? <CardBody><p className="text-sm text-ink-soft">Loading…</p></CardBody> : null}
        {error ? <CardBody><p className="text-sm text-red-600">{error}</p></CardBody> : null}
        {!loading && items.length ? (
          <ul className="divide-y divide-ink/10">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <Thumb src={p.imageUrls[0]} alt={p.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {[p.brand, formatMoney(p.priceCents, p.currency), p.options.length ? `${p.options.length} option${p.options.length > 1 ? "s" : ""}` : null, p.supplierName ? `sourced from ${p.supplierName}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleStock(p)}>{p.inStock ? "Mark out of stock" : "Mark in stock"}</Button>
                <Button variant="ghost" size="sm" onClick={() => removeProduct(p)}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Dialog open={importFor !== null} onOpenChange={(open) => { if (!open) setImportFor(null); }}>
        <DialogContent>
          <DialogTitle>Sell "{importFor?.title}"</DialogTitle>
          <DialogDescription>
            Set your price. Buyers pay you, and you ship the order — buy it from the supplier and send it on, or ship your own stock.
          </DialogDescription>
          <input className={`${fieldClass}`} placeholder="Your price (e.g. 29.99)" value={importPrice} onChange={(e) => setImportPrice(e.target.value)} inputMode="decimal" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportFor(null)}>Cancel</Button>
            <Button onClick={doImport} disabled={importing !== null}>{importing ? "Importing…" : "Add to my store"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
