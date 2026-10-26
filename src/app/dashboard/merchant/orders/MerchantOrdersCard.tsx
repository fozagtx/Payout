"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Order } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardHeader } from "@/components/Card.js";
import { formatDate, formatMoney } from "@/components/format.js";
import { StatusPill } from "@/components/StatusPill.js";
import { Thumb } from "@/components/Thumb.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.js";
import { REFUND_REASON_LABELS } from "@/project/refund-types.js";
import { RefundDialog } from "../../RefundDialog.js";

type MerchantOrder = Order & { buyer: string };
type LoadState = "loading" | "ready" | "error";

export function MerchantOrdersCard() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);
  const [checkingDisputes, setCheckingDisputes] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<MerchantOrder | null>(null);
  const [declining, setDeclining] = useState<MerchantOrder | null>(null);
  const [message, setMessage] = useState("");
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  const loadOrders = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);

    const result = await api<{ orders: MerchantOrder[] }>("/api/merchant/orders");
    if (!result.ok) {
      setLoadError(result.status === 403 ? "Only the store owner can see this page." : result.message);
      setLoadState("error");
      return;
    }

    setOrders(result.data.orders);
    setLoadState("ready");
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const pendingOrders = orders.filter((order) => order.refundRequest?.status === "pending");
  const visibleOrders = showAll ? orders : pendingOrders;

  async function checkDisputes() {
    setCheckingDisputes(true);
    setDisputeMessage(null);
    const result = await api<{ disputes: unknown[] }>("/api/merchant/disputes");
    setCheckingDisputes(false);

    if (!result.ok) {
      setDisputeMessage(result.message);
      return;
    }

    setDisputeMessage(
      result.data.disputes.length === 0
        ? "No disputes on any order."
        : `${result.data.disputes.length} dispute(s) found — shown on the order.`
    );
  }

  function openDeclineDialog(order: MerchantOrder) {
    setDeclineError(null);
    setMessage("");
    setDeclining(order);
  }

  async function decline() {
    if (!declining || declineLoading) return;

    setDeclineLoading(true);
    setDeclineError(null);
    const result = await api<{ order: Order }>(`/api/merchant/orders/${declining.id}/refund-request/decline`, {
      method: "POST",
      body: { message: message.trim() || undefined },
    });
    setDeclineLoading(false);

    if (!result.ok) {
      setDeclineError(result.message);
      return;
    }

    setOrders((current) =>
      current.map((order) => (order.id === declining.id ? { ...order, ...result.data.order } : order))
    );
    setRowMessages((current) => ({ ...current, [declining.id]: "Request declined" }));
    setShowAll(true);
    setDeclining(null);
    setMessage("");
    setDeclineError(null);
  }

  function onRefundSuccess(order: Order, amountCents: number) {
    setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, ...order } : item)));
    setRowMessages((current) => ({
      ...current,
      [order.id]: `Refunded ${formatMoney(amountCents, order.currency)} to ${selected?.buyer ?? "the buyer"}`,
    }));
    setShowAll(true);
    setSelected(null);
  }

  function closeDeclineDialog(open: boolean) {
    if (open || declineLoading) return;
    setDeclining(null);
    setMessage("");
    setDeclineError(null);
  }

  return (
    <Card>
      <CardHeader
        title="Refund requests"
        description="Review buyer requests and manage every order."
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={checkingDisputes}
            onClick={() => void checkDisputes()}
          >
            Check disputes
          </Button>
        }
      />

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div
          className="inline-flex items-center gap-1 rounded-full border border-line bg-paper p-1 text-sm"
          role="group"
          aria-label="Orders view"
        >
          <button
            type="button"
            aria-pressed={!showAll}
            onClick={() => setShowAll(false)}
            className={`rounded-full px-3.5 py-1.5 font-medium ${
              !showAll ? "bg-ink-900 text-white" : "text-ink-soft hover:bg-ink/5"
            }`}
          >
            Refund requests ({pendingOrders.length})
          </button>
          <button
            type="button"
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
            className={`rounded-full px-3.5 py-1.5 font-medium ${
              showAll ? "bg-ink-900 text-white" : "text-ink-soft hover:bg-ink/5"
            }`}
          >
            All orders ({orders.length})
          </button>
        </div>

        {disputeMessage ? (
          <p className="text-sm text-ink-soft" role="status">
            {disputeMessage}
          </p>
        ) : null}

        {loadState === "loading" ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : loadState === "error" ? (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-soft">
              {loadError}
            </p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => void loadOrders()}>
              Try again
            </Button>
          </div>
        ) : visibleOrders.length === 0 ? (
          showAll ? (
            <p className="py-8 text-center text-sm text-ink-soft">
              No orders yet.
            </p>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-ink">
                No refund requests waiting.
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Buyers request refunds from their Orders page or through Claude.
              </p>
            </div>
          )
        ) : (
          <ul className="divide-y divide-line">
            {visibleOrders.map((order) => {
              const firstItem = order.items[0];
              const request = order.refundRequest;
              const refundedCents =
                order.refundedCents ?? order.refunds?.reduce((total, refund) => total + refund.cents, 0) ?? 0;
              const hasPaidStatus = order.status === "COMPLETED" || order.status === "PARTIALLY_REFUNDED";

              return (
                <li key={order.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Thumb
                        src={firstItem?.imageUrl}
                        alt={firstItem?.title ?? "Order"}
                        className="h-12 w-12 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {firstItem?.title ?? "Order"}
                          {order.items.length > 1 ? (
                            <span className="font-normal text-ink-soft">
                              {" "}
                              + {order.items.length - 1} more
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Buyer: {order.buyer}
                          {order.createdAt ? ` · ${formatDate(order.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="font-mono text-sm font-semibold text-ink">
                        {formatMoney(order.totalCents, order.currency)}
                      </span>
                      <StatusPill
                        status={order.status}
                      />
                    </div>
                  </div>

                  {refundedCents > 0 ? (
                    <p className="mt-2 text-xs text-ink-soft">
                      {formatMoney(refundedCents, order.currency)} of {formatMoney(order.totalCents, order.currency)}{" "}
                      refunded
                    </p>
                  ) : null}

                  {showAll && request?.status === "declined" ? (
                    <p className="mt-2 text-xs text-ink-soft">
                      Request declined
                      {request.merchantMessage ? ` · ${request.merchantMessage}` : ""}
                    </p>
                  ) : null}
                  {showAll && request?.status === "approved" ? (
                    <p className="mt-2 text-xs text-ink-soft">
                      Request approved
                    </p>
                  ) : null}

                  {request?.status === "pending" ? (
                    <div className="mt-3 rounded-xl border border-[#e8dcc7] bg-[#fbf6ed] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Refund request
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {formatMoney(request.amountCents, order.currency)} · {REFUND_REASON_LABELS[request.reason]}
                      </p>
                      {request.note ? (
                        <p className="mt-1 text-sm text-ink-soft">
                          &ldquo;{request.note}&rdquo;
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-ink-soft">
                        Requested {formatDate(request.requestedAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setSelected(order)}>
                          Review &amp; refund
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openDeclineDialog(order)}>
                          Decline
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {showAll && hasPaidStatus && request?.status !== "pending" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {rowMessages[order.id] ? (
                        <p className="text-sm font-medium text-emerald-800" role="status">
                          {rowMessages[order.id]}
                        </p>
                      ) : null}
                      <Button
                        className="ml-auto"
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelected(order)}
                      >
                        Refund
                      </Button>
                    </div>
                  ) : rowMessages[order.id] ? (
                    <p className="mt-3 text-sm font-medium text-emerald-800" role="status">
                      {rowMessages[order.id]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RefundDialog
        order={selected}
        open={selected !== null}
        mode="merchant"
        buyer={selected?.buyer}
        initial={selected?.refundRequest?.status === "pending" ? selected.refundRequest : undefined}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onRefundSuccess={onRefundSuccess}
      />

      <Dialog open={declining !== null} onOpenChange={closeDeclineDialog}>
        <DialogContent>
          <DialogTitle>Decline refund request</DialogTitle>
          <DialogDescription>
            Optionally explain why the request was declined.
          </DialogDescription>
          <label className="text-sm font-medium text-ink" htmlFor="decline-message">
            Message to buyer (optional)
          </label>
          <textarea
            id="decline-message"
            maxLength={255}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <p className="text-right text-xs text-ink-soft">
            {message.length}/255
          </p>
          {declineError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {declineError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={declineLoading}
              onClick={() => closeDeclineDialog(false)}
            >
              Cancel
            </Button>
            <Button loading={declineLoading} onClick={() => void decline()}>
              Confirm decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
