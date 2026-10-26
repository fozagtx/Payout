import type { CreatePaymentInput, PayPalOrderStatus, PaymentOrder, Payments, ShippingAddress } from "../services.js";

/**
 * PayPal Orders v2 (sandbox unless configured otherwise): client-credentials
 * token, create / get / capture. Amounts go out as 2-decimal strings computed
 * from integer cents, never through floats.
 */
export interface PayPalOptions {
  clientId?: string;
  clientSecret?: string;
  /** Webhook id from the PayPal app; without it webhook deliveries can't be verified. */
  webhookId?: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

/** A non-2xx answer from PayPal. Carries no credentials or tokens. */
export class PayPalApiError extends Error {
  readonly status: number;
  /** PayPal's error `name` (or OAuth `error`), e.g. UNPROCESSABLE_ENTITY. */
  readonly paypalName?: string;
  /** details[0].issue, e.g. ORDER_NOT_APPROVED. */
  readonly issue?: string;
  readonly debugId?: string;

  constructor(status: number, paypalName?: string, issue?: string, debugId?: string, description?: string) {
    super(
      `paypal_api_error ${status}${paypalName ? ` ${paypalName}` : ""}${issue ? ` ${issue}` : ""}${description ? `: ${description}` : ""}`
    );
    this.name = "PayPalApiError";
    this.status = status;
    this.paypalName = paypalName;
    this.issue = issue;
    this.debugId = debugId;
  }
}

/** 1234 → "12.34". Integer cents only. */
export function formatCents(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`invalid amount in cents: ${cents}`);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}

const STATUSES: readonly PayPalOrderStatus[] = ["CREATED", "SAVED", "APPROVED", "VOIDED", "COMPLETED", "PAYER_ACTION_REQUIRED"];

type PayPalOrderBody = {
  id?: string;
  status?: string;
  links?: { href?: string; rel?: string }[];
  purchase_units?: {
    payments?: { captures?: { id?: string }[] };
    shipping?: {
      name?: { full_name?: string };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_2?: string;
        admin_area_1?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
  }[];
};

function toShipping(unit: NonNullable<PayPalOrderBody["purchase_units"]>[number] | undefined): ShippingAddress | undefined {
  const shipping = unit?.shipping;
  if (!shipping?.address) return undefined;
  const { address } = shipping;
  const entries = {
    name: shipping.name?.full_name,
    line1: address.address_line_1,
    line2: address.address_line_2,
    city: address.admin_area_2,
    state: address.admin_area_1,
    postalCode: address.postal_code,
    countryCode: address.country_code,
  };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => typeof value === "string" && value)) as ShippingAddress;
}

function toPaymentOrder(body: PayPalOrderBody, fallbackId?: string): PaymentOrder {
  const status = STATUSES.find((s) => s === body.status);
  if (!status) throw new Error(`unexpected PayPal order status: ${String(body.status)}`);
  const approve = body.links?.find((link) => link.rel === "payer-action") ?? body.links?.find((link) => link.rel === "approve");
  const captureId = body.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  const shipping = toShipping(body.purchase_units?.[0]);
  return {
    paypalOrderId: body.id ?? fallbackId ?? "",
    status,
    ...(approve?.href ? { approveUrl: approve.href } : {}),
    ...(captureId ? { captureId } : {}),
    ...(shipping ? { shipping } : {}),
  };
}

const truncate = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

export function createPayPalPayments(options: PayPalOptions): Payments {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  let cached: { token: string; expiresAt: number } | undefined;

  function credentials() {
    if (!options.clientId || !options.clientSecret) throw new Error("paypal_not_configured");
    return { clientId: options.clientId, clientSecret: options.clientSecret };
  }

  async function errorFrom(response: Response) {
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    const details = Array.isArray(body.details) ? body.details : [];
    return new PayPalApiError(
      response.status,
      typeof body.name === "string" ? body.name : typeof body.error === "string" ? body.error : undefined,
      typeof details[0]?.issue === "string" ? details[0].issue : undefined,
      typeof body.debug_id === "string" ? body.debug_id : undefined,
      typeof details[0]?.description === "string"
        ? details[0].description
        : typeof body.message === "string"
          ? body.message
          : typeof body.error_description === "string"
            ? body.error_description
            : undefined
    );
  }

  async function accessToken() {
    const { clientId, clientSecret } = credentials();
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const response = await doFetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw await errorFrom(response);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new PayPalApiError(response.status, "invalid_token_response");
    // Reuse until ~60s before expiry.
    cached = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in ?? 0) - 60) * 1000 };
    return cached.token;
  }

  async function api<T = PayPalOrderBody>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T> {
    const send = async () =>
      doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(requestId ? { "paypal-request-id": requestId } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    let response = await send();
    if (response.status === 401) {
      // Token revoked or expired early: get a fresh one and retry once.
      cached = undefined;
      response = await send();
    }
    if (!response.ok) throw await errorFrom(response);
    return (await response.json()) as T;
  }

  async function getOrder(paypalOrderId: string) {
    credentials();
    return toPaymentOrder(await api("GET", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`), paypalOrderId);
  }

  return {
    async createOrder(input: CreatePaymentInput) {
      credentials();
      if (input.lines.length === 0) throw new Error("an order needs at least one line");
      const currency = input.currency.toUpperCase();
      let totalCents = 0;
      const items = input.lines.map((line) => {
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error(`invalid quantity: ${line.quantity}`);
        const unit = formatCents(line.unitCents);
        totalCents += line.unitCents * line.quantity;
        return {
          name: truncate(line.title.trim() || line.productId, 127),
          quantity: String(line.quantity),
          unit_amount: { currency_code: currency, value: unit },
          category: "PHYSICAL_GOODS",
        };
      });
      const total = formatCents(totalCents);
      const first = input.lines[0]!.title.trim();
      const description = truncate(
        input.lines.length === 1 ? first : `${first} and ${input.lines.length - 1} more item(s)`,
        127
      );
      const body = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.referenceId,
            description,
            amount: { currency_code: currency, value: total, breakdown: { item_total: { currency_code: currency, value: total } } },
            items,
          },
        ],
        payment_source: {
          paypal: {
            ...(input.payerEmail ? { email_address: input.payerEmail } : {}),
            experience_context: {
              brand_name: "Payout",
              user_action: "PAY_NOW",
              shipping_preference: "GET_FROM_FILE",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      };
      return toPaymentOrder(await api("POST", "/v2/checkout/orders", body, input.referenceId));
    },

    getOrder,

    async captureOrder(paypalOrderId: string) {
      credentials();
      try {
        return toPaymentOrder(
          await api("POST", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {}),
          paypalOrderId
        );
      } catch (error) {
        if (error instanceof PayPalApiError && error.issue === "ORDER_ALREADY_CAPTURED") return getOrder(paypalOrderId);
        throw error;
      }
    },

    async refundCapture(captureId: string, requestId: string) {
      credentials();
      const body = await api<{ id?: string; status?: string }>(
        "POST",
        `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
        {},
        requestId
      );
      if (!body.id) throw new PayPalApiError(200, "invalid_refund_response");
      return { refundId: body.id, status: body.status ?? "COMPLETED" };
    },

    async verifyWebhook({ headers, event }) {
      if (!options.webhookId) return false;
      credentials();
      const body = await api<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: options.webhookId,
        webhook_event: event,
      });
      return body.verification_status === "SUCCESS";
    },
  };
}
