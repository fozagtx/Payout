"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatDate, formatMoney } from "@/components/format.js";

type Earnings = {
  clicks: number;
  sales: number;
  transactions: { date: string; merchant: string; saleAmount: number; commission: number; currency: string; status: string }[];
  totals: { sales: number; commission: number; currency: string };
};

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

  return (
    <Card>
      <CardHeader icon={<Wallet className="h-4 w-4" />} title="Store earnings" description="Channel3 affiliate reporting · last 30 days." />
      {state.status === "loading" ? (
        <div className="space-y-3 px-5 py-5 sm:px-6" aria-hidden="true">
          {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-cream" />)}
        </div>
      ) : state.status === "error" ? (
        <div className="px-5 py-7 text-center sm:px-6">
          <p className="text-sm text-ink-soft">We couldn’t load earnings. {state.message}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>Try again</Button>
        </div>
      ) : (
        <div className="px-5 py-5 sm:px-6">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Clicks" value={state.earnings.clicks.toLocaleString()} />
            <Metric label="Sales" value={state.earnings.sales.toLocaleString()} />
            <Metric label="Commission" value={formatMoney(Math.round(state.earnings.totals.commission * 100), state.earnings.totals.currency)} />
          </div>
          {state.earnings.totals.commission === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No commission yet — buys through the store links on product pages earn it</p>
          ) : null}
          {state.earnings.transactions.length ? (
            <ul className="mt-4 divide-y divide-line">
              {state.earnings.transactions.slice(0, 5).map((transaction, index) => (
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
          <p className="mt-3 text-[11px] text-muted-foreground">Channel3 reporting may lag behind recent clicks and purchases.</p>
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
