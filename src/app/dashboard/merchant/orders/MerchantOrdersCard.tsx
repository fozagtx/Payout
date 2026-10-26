"use client";

import { useEffect, useState } from "react";
import { api, type Order } from "../../../../components/api.js";
import { formatDate, formatMoney } from "../../../../components/format.js";
import { Button } from "../../../../components/ui/button.js";
import { Card, CardContent, CardHeader } from "../../../../components/ui/card.js";
import { StatusPill } from "../../../../components/StatusPill.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../../../components/ui/dialog.js";
import { RefundDialog } from "../../RefundDialog.js";

const reasons: Record<string, string> = { item_not_received: "Item not received", damaged_or_defective: "Damaged or defective", not_as_described: "Not as described", changed_mind: "Buyer changed their mind", duplicate_order: "Duplicate order", other: "Other" };

export function MerchantOrdersCard() {
  const [orders, setOrders] = useState<(Order & { buyer: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<(Order & { buyer: string }) | null>(null);
  const [message, setMessage] = useState("");
  const [declining, setDeclining] = useState<(Order & { buyer: string }) | null>(null);
  useEffect(() => { void api<{ orders: (Order & { buyer: string })[] }>("/api/merchant/orders").then((result) => { if (result.ok) setOrders(result.data.orders); else setError(result.status === 403 ? "Only the store owner can see this page." : result.message); }); }, []);
  const pending = orders.filter((order) => order.refundRequest?.status === "pending");
  const visibleOrders = showAll ? orders : pending;
  async function decline() {
    if (!declining) return;
    const result = await api<{ order: Order }>(`/api/merchant/orders/${declining.id}/refund-request/decline`, { method: "POST", body: JSON.stringify({ message }) });
    if (result.ok) setOrders((current) => current.map((order) => order.id === declining.id ? { ...order, ...result.data.order } : order));
    setDeclining(null); setMessage("");
  }
  if (error) return <Card><CardContent><p className="py-6 text-center text-ink-soft">{error}</p></CardContent></Card>;
  return <Card><CardHeader><div className="flex items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => setShowAll(false)} className={!showAll ? "font-semibold text-ink" : "text-ink-soft"}>Refund requests ({pending.length})</button><button type="button" onClick={() => setShowAll(true)} className={showAll ? "font-semibold text-ink" : "text-ink-soft"}>All orders</button></div><Button size="sm" variant="secondary" onClick={async () => { const result = await api<{ disputes: unknown[] }>("/api/merchant/disputes"); setDisputeMessage(result.ok && result.data.disputes.length === 0 ? "No disputes on any order." : result.ok ? `${result.data.disputes.length} dispute(s) found — shown on the order.` : result.message); }}>Check disputes</Button></div></CardHeader><CardContent className="space-y-3">
    {disputeMessage ? <p className="text-sm text-ink-soft">{disputeMessage}</p> : null}
    {visibleOrders.map((order) => <div key={order.id} className="rounded-xl border border-ink/10 p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{order.buyer}</p><p className="text-xs text-ink-soft">{formatDate(order.createdAt ?? new Date())} · {order.items[0]?.title ?? "Order"} · {formatMoney(order.totalCents, order.currency)}</p></div><StatusPill status={order.status} /></div>
      {order.refundRequest?.status === "pending" ? <div className="mt-3 text-sm"><p>{formatMoney(order.refundRequest.amountCents, order.currency)} · {reasons[order.refundRequest.reason]} · {formatDate(order.refundRequest.requestedAt)}</p>{order.refundRequest.note ? <p>“{order.refundRequest.note}”</p> : null}<div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setSelected(order)}>Review & refund</Button><Button size="sm" variant="secondary" onClick={() => setDeclining(order)}>Decline</Button></div></div> : showAll && (order.status === "COMPLETED" || order.status === "PARTIALLY_REFUNDED") ? <Button className="mt-2" size="sm" variant="secondary" onClick={() => setSelected(order)}>Refund</Button> : null}
    </div>)}
    <RefundDialog order={selected} open={Boolean(selected)} mode="merchant" buyer={selected?.buyer} initial={selected?.refundRequest?.status === "pending" ? selected.refundRequest : undefined} onOpenChange={(open: boolean) => { if (!open) setSelected(null); }} onRefundSuccess={(updated: Order) => { setOrders((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setSelected(null); }} />
    <Dialog open={Boolean(declining)} onOpenChange={(open: boolean) => { if (!open) setDeclining(null); }}><DialogContent><DialogTitle>Decline refund request</DialogTitle><DialogDescription>Optionally explain why the request was declined.</DialogDescription><textarea maxLength={255} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-24 w-full rounded-xl border border-ink/20 p-3" /><DialogFooter><Button onClick={() => void decline()}>Confirm decline</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}
