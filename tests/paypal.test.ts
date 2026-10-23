import { describe, expect, it } from "vitest";
import { PayPalApiError, createPayPalPayments, formatCents } from "../src/project/paypal/client.js";
import type { CreatePaymentInput } from "../src/project/services.js";

const BASE = "https://api-m.sandbox.paypal.com";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };
type Reply = { status?: number; body: unknown };

/** A fetch fake: records calls and answers from a routing function. */
function fakeFetch(route: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : undefined,
    };
    calls.push(call);
    const reply = route(call);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const tokenReply: Reply = { body: { access_token: "A21-token", token_type: "Bearer", expires_in: 32400 } };

function paypal(route: (call: Call) => Reply) {
  const fake = fakeFetch((call) => (call.url.endsWith("/v1/oauth2/token") ? tokenReply : route(call)));
  const payments = createPayPalPayments({ clientId: "client-id", clientSecret: "s3cret", baseUrl: BASE, fetch: fake.fetch });
  return { payments, calls: fake.calls, apiCalls: () => fake.calls.filter((c) => !c.url.endsWith("/oauth2/token")) };
}

const input: CreatePaymentInput = {
  referenceId: "0b7e1f0e-1111-4c1e-9d55-000000000001",
  currency: "USD",
  lines: [
    { productId: "p1", title: "Trail Runner Shoe", quantity: 2, unitCents: 4999 },
    { productId: "p2", title: "x".repeat(200), quantity: 1, unitCents: 5 },
  ],
  returnUrl: "https://payout.test/paypal/return",
  cancelUrl: "https://payout.test/paypal/cancel?order=0b7e1f0e",
  payerEmail: "buyer@personal.example.com",
};

const createdReply = (rel = "payer-action", status = "PAYER_ACTION_REQUIRED"): Reply => ({
  body: {
    id: "5O190127TN364715T",
    status,
    links: [
      { href: `${BASE}/v2/checkout/orders/5O190127TN364715T`, rel: "self", method: "GET" },
      { href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", rel, method: "GET" },
    ],
  },
});

describe("formatCents", () => {
  it("formats integer cents as a 2-decimal string without float math", () => {
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(1234)).toBe("12.34");
    expect(formatCents(10000)).toBe("100.00");
    expect(formatCents(123456789)).toBe("1234567.89");
    expect(() => formatCents(1.5)).toThrow();
    expect(() => formatCents(-1)).toThrow();
  });
});

describe("createPayPalPayments", () => {
  it("throws paypal_not_configured lazily when credentials are missing", async () => {
    const fake = fakeFetch(() => ({ body: {} }));
    const payments = createPayPalPayments({ baseUrl: BASE, fetch: fake.fetch });
    await expect(payments.createOrder(input)).rejects.toThrow("paypal_not_configured");
    await expect(payments.getOrder("X")).rejects.toThrow("paypal_not_configured");
    await expect(payments.captureOrder("X")).rejects.toThrow("paypal_not_configured");
    const halfConfigured = createPayPalPayments({ clientId: "id", baseUrl: BASE, fetch: fake.fetch });
    await expect(halfConfigured.getOrder("X")).rejects.toThrow("paypal_not_configured");
    expect(fake.calls).toHaveLength(0);
  });

  it("gets a client-credentials token with Basic auth and caches it across calls", async () => {
    const { payments, calls } = paypal(() => createdReply());
    await payments.createOrder(input);
    await payments.getOrder("5O190127TN364715T");
    const tokenCalls = calls.filter((c) => c.url === `${BASE}/v1/oauth2/token`);
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.method).toBe("POST");
    expect(tokenCalls[0]!.headers.authorization).toBe(`Basic ${Buffer.from("client-id:s3cret").toString("base64")}`);
    expect(tokenCalls[0]!.headers["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(tokenCalls[0]!.body).toBe("grant_type=client_credentials");
    for (const call of calls.filter((c) => !c.url.endsWith("/oauth2/token"))) {
      expect(call.headers.authorization).toBe("Bearer A21-token");
    }
  });

  it("refreshes the token when it is about to expire", async () => {
    let n = 0;
    const fake = fakeFetch((call) =>
      call.url.endsWith("/oauth2/token")
        ? { body: { access_token: `tok-${++n}`, expires_in: 30 } } // < 60s margin: never reusable
        : createdReply()
    );
    const payments = createPayPalPayments({ clientId: "a", clientSecret: "b", baseUrl: BASE, fetch: fake.fetch });
    await payments.getOrder("A");
    await payments.getOrder("B");
    expect(fake.calls.filter((c) => c.url.endsWith("/oauth2/token"))).toHaveLength(2);
  });

  it("creates a CAPTURE order with the right body, idempotency header and item_total", async () => {
    const { payments, apiCalls } = paypal(() => createdReply());
    const order = await payments.createOrder(input);
    expect(order).toEqual({
      paypalOrderId: "5O190127TN364715T",
      status: "PAYER_ACTION_REQUIRED",
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
    });
    const [call] = apiCalls();
    expect(call!.url).toBe(`${BASE}/v2/checkout/orders`);
    expect(call!.method).toBe("POST");
    expect(call!.headers["paypal-request-id"]).toBe(input.referenceId);
    expect(call!.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(call!.body!);
    expect(body.intent).toBe("CAPTURE");
    const unit = body.purchase_units[0];
    expect(unit.reference_id).toBe(input.referenceId);
    expect(typeof unit.description).toBe("string");
    expect(unit.description.length).toBeLessThanOrEqual(127);
    expect(unit.amount).toEqual({
      currency_code: "USD",
      value: "100.03",
      breakdown: { item_total: { currency_code: "USD", value: "100.03" } },
    });
    expect(unit.items).toEqual([
      { name: "Trail Runner Shoe", quantity: "2", unit_amount: { currency_code: "USD", value: "49.99" }, category: "PHYSICAL_GOODS" },
      { name: "x".repeat(127), quantity: "1", unit_amount: { currency_code: "USD", value: "0.05" }, category: "PHYSICAL_GOODS" },
    ]);
    expect(body.payment_source.paypal).toEqual({
      email_address: "buyer@personal.example.com",
      experience_context: {
        brand_name: "Payout",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    });
  });

  it("omits email_address when there is no payer email, and accepts the 'approve' rel", async () => {
    const { payments, apiCalls } = paypal(() => createdReply("approve", "CREATED"));
    const order = await payments.createOrder({ ...input, payerEmail: undefined });
    expect(order.status).toBe("CREATED");
    expect(order.approveUrl).toBe("https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T");
    expect(JSON.parse(apiCalls()[0]!.body!).payment_source.paypal).not.toHaveProperty("email_address");
  });

  it("gets an order, including a capture id when there is one", async () => {
    const { payments, apiCalls } = paypal(() => ({
      body: { id: "ORD", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] },
    }));
    expect(await payments.getOrder("ORD")).toEqual({ paypalOrderId: "ORD", status: "COMPLETED", captureId: "CAP1" });
    expect(apiCalls()[0]!.url).toBe(`${BASE}/v2/checkout/orders/ORD`);
    expect(apiCalls()[0]!.method).toBe("GET");
  });

  it("captures an approved order", async () => {
    const { payments, apiCalls } = paypal(() => ({
      status: 201,
      body: { id: "ORD", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "3C679366HH908993F" }] } }] },
    }));
    expect(await payments.captureOrder("ORD")).toEqual({ paypalOrderId: "ORD", status: "COMPLETED", captureId: "3C679366HH908993F" });
    const [call] = apiCalls();
    expect(call!.url).toBe(`${BASE}/v2/checkout/orders/ORD/capture`);
    expect(call!.method).toBe("POST");
    expect(call!.headers["content-type"]).toBe("application/json");
    expect(call!.body).toBe("{}");
  });

  it("surfaces ORDER_NOT_APPROVED as a typed error without credentials", async () => {
    const { payments } = paypal(() => ({
      status: 422,
      body: {
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not yet approved the Order for payment." }],
        debug_id: "dbg123",
      },
    }));
    const error = await payments.captureOrder("ORD").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayPalApiError);
    const apiError = error as PayPalApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.paypalName).toBe("UNPROCESSABLE_ENTITY");
    expect(apiError.issue).toBe("ORDER_NOT_APPROVED");
    expect(apiError.debugId).toBe("dbg123");
    expect(apiError.message).toContain("ORDER_NOT_APPROVED");
    expect(apiError.message).not.toContain("s3cret");
    expect(apiError.message).not.toContain("A21-token");
  });

  it("falls back to getOrder when the order was already captured", async () => {
    const { payments, apiCalls } = paypal((call) =>
      call.method === "POST"
        ? { status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } }
        : { body: { id: "ORD", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP9" }] } }] } }
    );
    expect(await payments.captureOrder("ORD")).toEqual({ paypalOrderId: "ORD", status: "COMPLETED", captureId: "CAP9" });
    expect(apiCalls().map((c) => c.method)).toEqual(["POST", "GET"]);
  });

  it("reports a failed token request as a PayPalApiError", async () => {
    const fake = fakeFetch(() => ({ status: 401, body: { error: "invalid_client", error_description: "Client Authentication failed" } }));
    const payments = createPayPalPayments({ clientId: "a", clientSecret: "wrong-secret", baseUrl: BASE, fetch: fake.fetch });
    const error = (await payments.getOrder("X").catch((e: unknown) => e)) as PayPalApiError;
    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error.status).toBe(401);
    expect(error.paypalName).toBe("invalid_client");
    expect(error.message).not.toContain("wrong-secret");
  });

  it("refuses non-integer or empty amounts before calling PayPal", async () => {
    const { payments, apiCalls } = paypal(() => createdReply());
    await expect(payments.createOrder({ ...input, lines: [] })).rejects.toThrow();
    await expect(
      payments.createOrder({ ...input, lines: [{ productId: "p", title: "t", quantity: 1, unitCents: 9.99 }] })
    ).rejects.toThrow();
    expect(apiCalls()).toHaveLength(0);
  });
});
