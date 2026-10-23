"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Order } from "@/components/api.js";
import { ButtonAnchor, Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatDate, formatMoney } from "@/components/format.js";
import { BagIcon } from "@/components/Icons.js";
import { Thumb } from "@/components/Thumb.js";
import { orderStatus, StatusPill } from "@/components/StatusPill.js";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; orders: Order[] };

export function OrdersCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await api<{ orders: Order[] }>("/api/orders");
    if (result.ok) setState({ status: "ready", orders: result.data?.orders ?? [] });
    else if (result.status === 404) setState({ status: "ready", orders: [] });
    else setState({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader
        icon={<BagIcon />}
        title="Orders"
        description="Everything you’ve bought through Claude."
        action={
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={state.status === "loading"}>
            Refresh
          </Button>
        }
      />
      <div>
        {state.status === "loading" ? (
          <div className="space-y-3 px-5 py-5 sm:px-6" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : state.status === "error" ? (
          <div className="px-5 py-8 text-center sm:px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">We couldn’t load your orders. {state.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : state.orders.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky text-brand dark:bg-brand/15 dark:text-sky-300">
              <BagIcon />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">No orders yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
              Ask Claude to find something, pick it in the canvas and pay with PayPal. It’ll appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {state.orders.map((order) => {
              const info = orderStatus(order.status);
              const items = order.items ?? [];
              const count = items.reduce((n, i) => n + (i.quantity || 0), 0);
              const first = items[0];
              return (
                <li key={order.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex -space-x-3">
                        {items.slice(0, 3).map((item, i) => (
                          <Thumb key={`${item.productId}-${i}`} src={item.imageUrl} alt={item.title} className="h-11 w-11 ring-2 ring-white dark:ring-slate-900" />
                        ))}
                        {items.length === 0 ? <Thumb alt="" className="h-11 w-11" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {first ? first.title : "Order"}
                          {items.length > 1 ? <span className="font-normal text-slate-500"> + {items.length - 1} more</span> : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {count} {count === 1 ? "item" : "items"}
                          {first?.merchant ? ` · ${first.merchant}` : ""}
                          {order.createdAt ? ` · ${formatDate(order.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{formatMoney(order.totalCents, order.currency)}</p>
                        <div className="mt-0.5">
                          <StatusPill status={order.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {info.payable && order.approveUrl ? (
                    <div className="mt-3 flex justify-end">
                      <ButtonAnchor href={order.approveUrl} variant="paypal" size="sm">
                        Pay now
                      </ButtonAnchor>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
