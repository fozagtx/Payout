export const REFUND_REASONS = [
  "item_not_received",
  "damaged_or_defective",
  "not_as_described",
  "changed_mind",
  "duplicate_order",
  "other",
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

export interface RefundEntry {
  id: string;
  cents: number;
  reason: RefundReason | null;
  note: string | null;
  createdAt: string;
}
