"use client";

import { useSearchParams } from "next/navigation.js";
import { useEffect, useState } from "react";
import { api, type Order } from "@/components/api.js";
import { ButtonLink } from "@/components/Button.js";
import { formatMoney } from "@/components/format.js";
import { AlertIcon, CheckIcon, ChatIcon, Spinner } from "@/components/Icons.js";
import { StatusIcon } from "@/components/StatusLayout.js";
import { orderStatus, StatusPill } from "@/components/StatusPill.js";
import { Thumb } from "@/components/Thumb.js";

type PublicOrder = Pick<Order, "id" | "status" | "totalCents" | "currency" | "items">;
type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; order: PublicOrder };

const ERRORS: Record<string, string> = {
  not_approved: "PayPal hasn't confirmed your approval yet. Open PayPal again from Claude, or check the order in your dashboard.",
  cancelled: "This checkout was cancelled, so you have not been charged. Ask Claude to start a new one.",
  paypal_error: "PayPal couldn't complete the payment. You have not been charged. Try again from Claude.",
  paypal_not_configured: "Payments aren't set up on this server yet (missing PayPal sandbox credentials).",
  order_not_found: "We couldn't find this order.",
};

function errorMessage(code: string) {
  return ERRORS[code] ?? "Something went wrong while completing your payment. You have not been charged.";
}

export function OrderSummary({ order }: { order: PublicOrder }) {
  const items = order.items ?? [];
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Order summary</span>
        <StatusPill status={order.status} />
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item, i) => (
          <li key={`${item.productId}-${i}`} className="flex items-center gap-3 px-5 py-3">
            <Thumb src={item.imageUrl} alt={item.title} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
              <p className="text-xs text-slate-500">
                {item.quantity} × {formatMoney(item.unitCents, order.currency)}
                {item.merchant ? ` · ${item.merchant}` : ""}
              </p>
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatMoney(item.unitCents * item.quantity, order.currency)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between bg-slate-50 px-5 py-3.5 dark:bg-slate-950/50">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total</span>
        <span className="text-lg font-bold text-navy dark:text-white">{formatMoney(order.totalCents, order.currency)}</span>
      </div>
    </div>
  );
}

function ReturnHint() {
  return (
    <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
      <ChatIcon className="h-4 w-4" /> You can close this tab and return to Claude.
    </p>
  );
}

export function CheckoutComplete() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const errorCode = params.get("error");
  const [state, setState] = useState<State>(orderId ? { status: "loading" } : { status: "missing" });

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    void api<{ order: PublicOrder }>(`/api/orders/${encodeURIComponent(orderId)}/public`).then((result) => {
      if (!alive) return;
      if (result.ok) {
        if (result.data?.order) setState({ status: "ready", order: result.data.order });
        else setState({ status: "error", message: "We couldn't find this order." });
      } else setState({ status: "error", message: result.status === 404 ? "We couldn't find this order." : result.message });
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const actions = (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <ButtonLink href="/dashboard">View your orders</ButtonLink>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center py-16 text-slate-500" role="status">
        <Spinner className="h-7 w-7" />
        <p className="mt-4 text-sm">Confirming your payment with PayPal…</p>
      </div>
    );
  }

  const paid = state.status === "ready" && state.order.status.toUpperCase() === "COMPLETED";

  if (paid && !errorCode) {
    return (
      <div className="text-center">
        <StatusIcon tone="green">
          <CheckIcon className="h-8 w-8" />
        </StatusIcon>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-white">Payment complete</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Thanks! PayPal confirmed your payment.</p>
        <OrderSummary order={state.order} />
        <ReturnHint />
        {actions}
      </div>
    );
  }

  const order = state.status === "ready" ? state.order : null;
  const info = order ? orderStatus(order.status) : null;
  let title = "We couldn’t complete your payment";
  let message = errorCode ? errorMessage(errorCode) : state.status === "error" ? state.message : "This link is missing an order.";
  let tone: "red" | "amber" = "red";
  if (!errorCode && order && info) {
    if (order.status.toUpperCase() === "APPROVED") {
      title = "Payment approved";
      message = "PayPal approved your payment and we’re finishing up. Refresh in a moment to see it marked as paid.";
      tone = "amber";
    } else if (info.payable) {
      title = "Payment not finished yet";
      message = "This order is still waiting for payment on PayPal.";
      tone = "amber";
    } else if (info.label === "Cancelled") {
      title = "Order cancelled";
      message = "This order was cancelled. No payment was taken.";
      tone = "amber";
    }
  }

  return (
    <div className="text-center">
      <StatusIcon tone={tone}>
        <AlertIcon className="h-8 w-8" />
      </StatusIcon>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-white">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-slate-600 dark:text-slate-400">{message}</p>
      {order ? <OrderSummary order={order} /> : null}
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <ChatIcon className="h-4 w-4" /> Head back to Claude and ask it to try the checkout again.
      </p>
      {actions}
    </div>
  );
}
