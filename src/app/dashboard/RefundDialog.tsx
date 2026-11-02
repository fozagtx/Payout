"use client";

import { useEffect, useState } from "react";
import { api, type Order } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { formatMoney } from "@/components/format.js";
import { Thumb } from "@/components/Thumb.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog.js";
import type { RefundReason } from "@/project/refund-types.js";

const REASON_LABELS: Record<RefundReason, string> = {
  item_not_received: "Item not received",
  damaged_or_defective: "Damaged or defective",
  not_as_described: "Not as described",
  changed_mind: "I changed my mind",
  duplicate_order: "Duplicate order",
  other: "Other",
};

const REASONS = Object.entries(REASON_LABELS) as [RefundReason, string][];

function parseAmountCents(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}

export function RefundDialog({
  order,
  open,
  onOpenChange,
  onRefundSuccess,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefundSuccess: (order: Order, amountCents: number) => void;
}) {
  const [step, setStep] = useState<"details" | "review">("details");
  const [partial, setPartial] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState<RefundReason | "">("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const refundedCents = order?.refundedCents ?? order?.refunds?.reduce((sum, refund) => sum + refund.cents, 0) ?? 0;
  const remainingCents = order ? Math.max(0, order.totalCents - refundedCents) : 0;
  const amountCents = partial ? parseAmountCents(amountInput) : remainingCents;
  const amountValid = amountCents !== undefined && amountCents > 0 && amountCents <= remainingCents;
  const trimmedNote = note.trim();
  useEffect(() => {
    if (!open) return;
    setStep("details");
    setPartial(false);
    setAmountInput("");
    setReason("");
    setNote("");
    setLoading(false);
    setServerError(null);
  }, [open, order?.id]);

  async function confirmRefund() {
    if (!order || !reason || amountCents === undefined || !amountValid) return;
    setLoading(true);
    setServerError(null);
    const result = await api<{ order: Order }>(`/api/orders/${order.id}/refund`, {
      method: "POST",
      body: {
        ...(partial ? { amountCents } : {}),
        reason,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
    });
    setLoading(false);
    if (!result.ok) {
      setServerError(result.message);
      return;
    }
    onRefundSuccess(result.data.order, amountCents);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {order ? (
          step === "details" ? (
            <>
              <div className="flex items-start gap-3">
                <Thumb src={order.items[0]?.imageUrl} alt={order.items[0]?.title ?? ""} className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <DialogTitle>Refund order</DialogTitle>
                  <DialogDescription className="mt-1 truncate">{order.items[0]?.title ?? "Order"}</DialogDescription>
                  <p className="mt-1 text-sm text-ink-soft">Paid {formatMoney(order.totalCents, order.currency)}</p>
                  {refundedCents > 0 ? (
                    <p className="text-sm text-ink-soft">Already refunded {formatMoney(refundedCents, order.currency)}</p>
                  ) : null}
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold text-ink">Amount</legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-sm text-ink">
                  <input type="radio" name="refund-amount" checked={!partial} onChange={() => setPartial(false)} />
                  <span>Full refund: {formatMoney(remainingCents, order.currency)}</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${partial ? "border-brand bg-white" : "border-line bg-white/60"}`}>
                  <input type="radio" name="refund-amount" checked={partial} onChange={() => setPartial(true)} />
                  <span className="flex flex-1 items-center justify-between gap-3">
                    <span>Partial amount</span>
                    <span className="flex items-center rounded-lg border border-line bg-white px-2.5">
                      <span className="text-ink-soft">$</span>
                      <input
                        aria-label="Partial refund amount"
                        className="w-24 border-0 bg-transparent py-1.5 pl-1 text-right font-mono text-sm text-ink outline-none"
                        inputMode="decimal"
                        maxLength={14}
                        value={amountInput}
                        onChange={(event) => setAmountInput(event.target.value)}
                        onFocus={() => setPartial(true)}
                        placeholder="0.00"
                      />
                    </span>
                  </span>
                </label>
                {partial && amountInput && !amountValid ? (
                  <p className="text-xs text-red-700">Enter an amount from $0.01 up to {formatMoney(remainingCents, order.currency)}.</p>
                ) : null}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold text-ink">Reason</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REASONS.map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white/50 px-3 py-2 text-sm text-ink">
                      <input type="radio" name="refund-reason" checked={reason === value} onChange={() => setReason(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="refund-note" className="text-sm font-semibold text-ink">
                  Note for PayPal (optional)
                </label>
                <textarea
                  id="refund-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={255}
                  rows={3}
                  className="mt-2 block w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    PayPal receives this note with the refund.
                  </span>
                  <span>{note.length}/255</span>
                </div>
              </div>

              {serverError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{serverError}</p> : null}
              <DialogFooter>
                <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => setStep("review")} disabled={!amountValid || !reason}>Continue</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div>
                <DialogTitle>Review refund</DialogTitle>
                <DialogDescription className="mt-1">Check the details before sending this refund.</DialogDescription>
              </div>
              <div className="space-y-4 rounded-xl border border-line bg-white/60 p-4 text-sm">
                <p className="font-semibold text-ink">
                  Refund {formatMoney(amountCents ?? 0, order.currency)} through PayPal.
                </p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
                  <p className="mt-1 text-ink">{reason ? REASON_LABELS[reason] : ""}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Note for PayPal
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink">{trimmedNote || "No message"}</p>
                </div>
              </div>
              <p className="text-sm font-medium text-amber-800">
                Refunds can't be undone.
              </p>
              {serverError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{serverError}</p> : null}
              <DialogFooter>
                <Button variant="secondary" onClick={() => { setServerError(null); setStep("details"); }} disabled={loading}>Back</Button>
                <Button onClick={() => void confirmRefund()} loading={loading}>Refund through PayPal</Button>
              </DialogFooter>
            </>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
