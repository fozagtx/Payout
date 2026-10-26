"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatMoney } from "@/components/format.js";
import { Thumb } from "@/components/Thumb.js";

type Watch = {
  id: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  currency: string;
  startCents: number | null;
  lastCents: number | null;
  lastInStock: boolean | null;
  alert: string | null;
};

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; watches: Watch[] };

export function AlertsCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [stopping, setStopping] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await api<{ watches: Watch[] }>("/api/watches");
    if (result.ok) setState({ status: "ready", watches: result.data.watches ?? [] });
    else setState({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function stop(watch: Watch) {
    setStopping(watch.id);
    const result = await api(`/api/watches/${watch.id}`, { method: "DELETE" });
    setStopping(null);
    if (result.ok) {
      setState((current) => current.status === "ready" ? { status: "ready", watches: current.watches.filter((item) => item.id !== watch.id) } : current);
    }
  }

  return (
    <Card>
      <CardHeader icon={<Bell className="h-4 w-4" />} title="Price alerts" description="Price drops and back-in-stock updates." />
      {state.status === "loading" ? (
        <div className="space-y-3 px-5 py-5 sm:px-6" aria-hidden="true">
          {[0, 1].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-cream" />)}
        </div>
      ) : state.status === "error" ? (
        <div className="px-5 py-7 text-center sm:px-6">
          <p className="text-sm text-ink-soft">We couldn’t load your alerts. {state.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>Try again</Button>
        </div>
      ) : state.watches.length === 0 ? (
        <div className="px-5 py-9 text-center sm:px-6">
          <p className="text-sm font-semibold text-ink">No price watches yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">Open a product in the shop and choose Watch price to get alerts here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {state.watches.map((watch) => (
            <li key={watch.id} className="px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <Thumb src={watch.imageUrl} alt={watch.title} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{watch.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {watch.startCents === null ? "No in-stock price yet" : formatMoney(watch.startCents, watch.currency)}
                    {" → "}
                    {watch.lastCents === null ? "—" : formatMoney(watch.lastCents, watch.currency)}
                    {" · "}
                    {watch.lastInStock === null ? "Stock unknown" : watch.lastInStock ? "In stock" : "Out of stock"}
                  </p>
                  {watch.alert ? <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">{watch.alert}</p> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void stop(watch)} loading={stopping === watch.id}>Stop</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
