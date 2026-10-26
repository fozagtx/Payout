export const REFUND_REASONS = [
  "item_not_received",
  "damaged_or_defective",
  "not_as_described",
  "changed_mind",
  "duplicate_order",
  "other",
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  item_not_received: "Item not received",
  damaged_or_defective: "Damaged or defective",
  not_as_described: "Not as described",
  changed_mind: "Buyer changed their mind",
  duplicate_order: "Duplicate order",
  other: "Other",
};

export interface RefundEntry {
  id: string;
  cents: number;
  reason: RefundReason | null;
  note: string | null;
  createdAt: string;
}

export type RefundRequest = {
  amountCents: number;
  reason: RefundReason;
  note?: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  requestedAt: string;
  decidedAt?: string;
  merchantMessage?: string;
};
