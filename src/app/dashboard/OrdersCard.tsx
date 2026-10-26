"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Order, type ShippingAddress } from "@/components/api.js";
import { ButtonAnchor, Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatDate, formatMoney } from "@/components/format.js";
import { BagIcon } from "@/components/Icons.js";
import { Thumb } from "@/components/Thumb.js";
import { orderStatus, StatusPill } from "@/components/StatusPill.js";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; orders: Order[] };

function shippingLine(shipping: ShippingAddress) {
  return [shipping.name, shipping.line1, shipping.line2, [shipping.city, shipping.state, shipping.postalCode].filter(Boolean).join(" "), shipping.countryCode]
    .filter(Boolean)
    .join(", ");
}

export function OrdersCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<{ id: string; message: string } | null>(null);
  const [checkingDisputes, setCheckingDisputes] = useState(false);
  const [disputesError, setDisputesError] = useState<string | null>(null);

  async function refund(order: Order) {
    if (!window.confirm(`Refund ${formatMoney(order.totalCents, order.currency)} to the buyer's PayPal Sandbox account?`)) return;
    setRefunding(order.id);
    setRefundError(null);
    const result = await api<{ order: Order }>(`/api/orders/${order.id}/refund`, { method: "POST", body: {} });
    setRefunding(null);
    if (!result.ok) {
      setRefundError({ id: order.id, message: result.message });
      return;
    }
    setState((current) =>
      current.status === "ready" ? { status: "ready", orders: current.orders.map((o) => (o.id === order.id ? result.data.order : o)) } : current
    );
  }

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await api<{ orders: Order[] }>("/api/orders");
    if (result.ok) setState({ status: "ready", orders: result.data?.orders ?? [] });
    else if (result.status === 404) setState({ status: "ready", orders: [] });
    else setState({ status: "error", message: result.message });
  }, []);

  async function checkDisputes() {
    setCheckingDisputes(true);
    setDisputesError(null);
    const result = await api<{ disputes: unknown[] }>("/api/disputes");
    setCheckingDisputes(false);
    if (!result.ok) {
      setDisputesError(result.message);
      return;
    }
    await load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader
        icon={<BagIcon />}
        title="Orders"
        description="Everything you’ve bought through Claude."
        action={<div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => void checkDisputes()} disabled={checkingDisputes}>
            Check disputes
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={state.status === "loading"}>
            Refresh
          </Button>
        </div>}
      />
      {disputesError ? <p className="px-5 pt-3 text-xs text-red-700 sm:px-6" role="alert">{disputesError}</p> : null}
      <div>
        {state.status === "loading" ? (
          <div className="space-y-3 px-5 py-5 sm:px-6" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : state.status === "error" ? (
          <div className="px-5 py-8 text-center sm:px-6">
            <p className="text-sm text-ink-soft">We couldn’t load your orders. {state.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : state.orders.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky text-brand">
              <BagIcon />
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">No orders yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Ask Claude to find something, pick it in the canvas and pay with PayPal. It’ll appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {state.orders.map((order) => {
              const info = orderStatus(order.status);
              const items = order.items ?? [];
              const count = items.reduce((n, i) => n + (i.quantity || 0), 0);
              const first = items[0];
              return (
                <li key={order.id} className="px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex -space-x-3">
                        {items.slice(0, 3).map((item, i) => (
                          <Thumb key={`${item.productId}-${i}`} src={item.imageUrl} alt={item.title} className="h-11 w-11 ring-2 ring-white" />
                        ))}
                        {items.length === 0 ? <Thumb alt="" className="h-11 w-11" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {first ? first.title : "Order"}
                          {items.length > 1 ? <span className="font-normal text-muted-foreground"> + {items.length - 1} more</span> : null}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {count} {count === 1 ? "item" : "items"}
                          {first?.merchant ? ` · ${first.merchant}` : ""}
                          {order.createdAt ? ` · ${formatDate(order.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-sm font-medium text-ink">{formatMoney(order.totalCents, order.currency)}</p>
                        <div className="mt-0.5">
                          <StatusPill status={order.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {order.shipping ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-ink-soft">Ships to</span> {shippingLine(order.shipping)}
                    </p>
                  ) : null}
                  {order.dispute ? (
                    <p className={`mt-2 text-xs font-semibold ${["OPEN", "UNDER_REVIEW"].includes(order.dispute.status ?? "") ? "text-red-700" : "text-amber-800"}`}>
                      Disputed · {order.dispute.reason ?? "Reason unavailable"} · {order.dispute.status ?? "Status unavailable"}
                    </p>
                  ) : null}
                  {info.payable && order.approveUrl ? (
                    <div className="mt-3 flex justify-end">
                      <ButtonAnchor href={order.approveUrl} variant="paypal" size="sm">
                        Pay now
                      </ButtonAnchor>
                    </div>
                  ) : null}
                  {order.status === "COMPLETED" ? (
                    <div className="mt-3 flex items-center justify-end gap-3">
                      {refundError?.id === order.id ? <span className="text-xs text-red-700">{refundError.message}</span> : null}
                      <Button variant="secondary" size="sm" onClick={() => void refund(order)} loading={refunding === order.id}>
                        Refund
                      </Button>
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
