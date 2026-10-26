import type { Storefront } from "./channel3/storefront.js";

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

/** A variant choice, `{ optionName: valueLabel }` (e.g. `{ Color: "Navy", Size: "10" }`). */
export type SelectedOptions = Record<string, string>;

export interface Catalog {
  search(query: string, options?: SearchOptions): Promise<Product[]>;
  /** With `selectedOptions`, prices that exact variant. */
  get(productId: string, selectedOptions?: SelectedOptions): Promise<Product | undefined>;
}

export interface OrderLine {
  productId: string;
  title: string;
  quantity: number;
  unitCents: number;
  imageUrl?: string;
  merchant?: string;
  options?: SelectedOptions;
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
  /** Where the buyer asked PayPal to ship (set once they approved). */
  shipping?: ShippingAddress;
}

export interface ShippingAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface Refund {
  refundId: string;
  status: string;
}

export interface Dispute {
  disputeId: string;
  reason: string;
  status: string;
  stage?: string;
  amountCents: number;
  currency: string;
  captureId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The headers and parsed body of a PayPal webhook delivery. */
export interface WebhookDelivery {
  headers: Record<string, string | undefined>;
  event: unknown;
}

export interface Payments {
  createOrder(input: CreatePaymentInput): Promise<PaymentOrder>;
  getOrder(paypalOrderId: string): Promise<PaymentOrder>;
  captureOrder(paypalOrderId: string): Promise<PaymentOrder>;
  /** Refunds a capture in full. `requestId` makes retries idempotent. */
  refundCapture(captureId: string, requestId: string): Promise<Refund>;
  listDisputes(): Promise<Dispute[]>;
  /** Asks PayPal whether a webhook delivery is genuine. False when no webhook id is configured. */
  verifyWebhook(delivery: WebhookDelivery): Promise<boolean>;
}

export interface Services {
  catalog: Catalog;
  /** The web storefront's Channel3 access (full SDK products). Unset without CHANNEL3_API_KEY. */
  storefront?: Storefront;
  payments: Payments;
  /** Public origin, for PayPal return/cancel URLs. */
  publicUrl: string;
  /** Signs image proxy URLs (/img). When unset, the proxy isn't mounted and images are passed through. */
  imageSecret?: string;
}
