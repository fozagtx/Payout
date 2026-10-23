/**
 * The outside services the tools and API routes depend on. Real
 * implementations live in src/project/channel3/ and src/project/paypal/;
 * tests pass fakes.
 */

/** A product as our tools and the canvas UI see it, normalised from Channel3. */
export interface Product {
  id: string;
  title: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  /** Price of the best in-stock offer, in minor units (cents). */
  priceCents: number;
  currency: string;
  compareAtCents?: number;
  merchant?: string;
  merchantUrl?: string;
  inStock: boolean;
}

export interface SearchOptions {
  limit?: number;
  maxPriceCents?: number;
  minPriceCents?: number;
}

export interface Catalog {
  search(query: string, options?: SearchOptions): Promise<Product[]>;
  get(productId: string): Promise<Product | undefined>;
}

export interface OrderLine {
  productId: string;
  title: string;
  quantity: number;
  unitCents: number;
  imageUrl?: string;
  merchant?: string;
}

export type PayPalOrderStatus =
  | "CREATED"
  | "SAVED"
  | "APPROVED"
  | "VOIDED"
  | "COMPLETED"
  | "PAYER_ACTION_REQUIRED";

export interface CreatePaymentInput {
  /** Our orders.id, sent as reference_id / PayPal-Request-Id. */
  referenceId: string;
  currency: string;
  lines: OrderLine[];
  returnUrl: string;
  cancelUrl: string;
  /** Pre-fills the PayPal login (the user's saved sandbox PayPal email). */
  payerEmail?: string;
}

export interface PaymentOrder {
  paypalOrderId: string;
  status: PayPalOrderStatus;
  /** Where the buyer approves the payment (rel "payer-action" or "approve"). */
  approveUrl?: string;
  captureId?: string;
}

export interface Payments {
  createOrder(input: CreatePaymentInput): Promise<PaymentOrder>;
  getOrder(paypalOrderId: string): Promise<PaymentOrder>;
  captureOrder(paypalOrderId: string): Promise<PaymentOrder>;
}

export interface Services {
  catalog: Catalog;
  payments: Payments;
  /** Public origin, for PayPal return/cancel URLs. */
  publicUrl: string;
}
