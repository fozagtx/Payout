"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatDate, formatMoney } from "@/components/format.js";

type Revenue = { orders: number; currency: string; grossCents: number; refundedCents: number; netCents: number };
type Channel3Earnings = {
  clicks: number;
  sales: number;
  transactions: { date: string; merchant: string; saleAmount: number; commission: number; currency: string; status: string }[];
  totals: { sales: number; commission: number; currency: string };
};
type Earnings = { revenue: Revenue; channel3: Channel3Earnings | null };

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; earnings: Earnings };

export function EarningsCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await api<Earnings>("/api/earnings?days=30");
    if (result.ok) setState({ status: "ready", earnings: result.data });
    else setState({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const channel3 = state.status === "ready" ? state.earnings.channel3 : null;

  return (
    <Card>
      <CardHeader icon={<Wallet className="h-4 w-4" />} title="Store earnings" description="Order revenue and supplier commission · last 30 days." />
      {state.status === "loading" ? (
        <div className="space-y-3 px-5 py-5 sm:px-6" aria-hidden="true">
          {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-cream" />)}
        </div>
      ) : state.status === "error" ? (
        <div className="px-5 py-7 text-center sm:px-6">
          <p className="text-sm text-ink-soft">{state.message === "Only the store owner can see this." ? state.message : `We couldn’t load earnings. ${state.message}`}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>Try again</Button>
        </div>
      ) : (
        <div className="px-5 py-5 sm:px-6">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Orders" value={String(state.earnings.revenue.orders)} />
            <Metric label="Sales" value={formatMoney(state.earnings.revenue.grossCents, state.earnings.revenue.currency)} />
            <Metric label="Net revenue" value={formatMoney(state.earnings.revenue.netCents, state.earnings.revenue.currency)} />
          </div>
          {state.earnings.revenue.refundedCents > 0 ? (
            <p className="mt-3 text-sm text-ink-soft">{formatMoney(state.earnings.revenue.refundedCents, state.earnings.revenue.currency)} refunded in this window.</p>
          ) : null}
          {channel3 ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier commission</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Metric label="Clicks" value={channel3.clicks.toLocaleString()} />
                <Metric label="Supplier sales" value={channel3.sales.toLocaleString()} />
                <Metric label="Commission" value={formatMoney(Math.round(channel3.totals.commission * 100), channel3.totals.currency)} />
              </div>
              {channel3.transactions.length ? (
                <ul className="mt-4 divide-y divide-line">
                  {channel3.transactions.slice(0, 5).map((transaction, index) => (
                    <li key={`${transaction.date}-${index}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{transaction.merchant}</p>
                        <p className="text-muted-foreground">{formatDate(transaction.date)} · {transaction.status}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-ink">{formatMoney(Math.round(transaction.saleAmount * 100), transaction.currency)}</p>
                        <p className="text-muted-foreground">Commission {formatMoney(Math.round(transaction.commission * 100), transaction.currency)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-[11px] text-muted-foreground">Catalog reporting may lag behind recent clicks and purchases.</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-cream px-3 py-2.5">
      <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
