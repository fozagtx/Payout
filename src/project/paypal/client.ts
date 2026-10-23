import type { Payments } from "../services.js";

/** STUB — replaced by the PayPal work. */
export function createPayPalPayments(_options: { clientId?: string; clientSecret?: string; baseUrl: string }): Payments {
  throw new Error("not implemented");
}
