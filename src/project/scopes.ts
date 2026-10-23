/**
 * What a connected AI client can ask to do. Each tool requires one of these,
 * and the consent page lists the labels so the user sees what they allow.
 * Money only moves after the user approves the payment on PayPal itself.
 */
export const SCOPES = {
  "shop:browse": "Search products and show them to you",
  "shop:checkout": "Start PayPal checkouts that you approve on PayPal",
  "orders:read": "See your orders and their payment status",
} as const;

export type Scope = keyof typeof SCOPES;
