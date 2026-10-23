# Requirements

Each slice was built test-first: the requirements below were written as
failing tests, then implemented. The test file is listed next to each group.
`scripts/e2e.mjs` covers the full OAuth flow, which is what Claude actually does.

## R1. Accounts: username and password, no Google sign-in (`tests/password.test.ts`, `tests/auth-api.test.ts`)

- R1.1 Sign up with a username (3–32 chars, a–z, 0–9, _) and a password of
  at least 8 characters. A taken username gives 409.
- R1.2 Passwords are stored as salted scrypt hashes and never returned by the API.
- R1.3 Login is rejected for a wrong password or an unknown user, with the
  same response and the same timing for both.
- R1.4 Sessions use an HttpOnly, SameSite=Lax, HMAC-signed cookie, shared by
  the Next.js pages and the OAuth consent screen (one origin).
- R1.5 A signed-out visit to a consent or connections page goes to `/login?next=…`
  and returns there afterwards. `next` can never leave the site.
- R1.6 Auth endpoints are rate-limited.

## R2. Connect Claude through MCP (`tests/auth-api.test.ts`, `scripts/e2e.mjs`)

- R2.1 The dashboard shows the user's connector URL (`<origin>/mcp`) and
  how to add it in Claude.
- R2.2 Claude signs in through OAuth 2.1 with PKCE, using either CIMD or DCR.
  The consent page lists what the AI may do (scopes `shop:browse`,
  `shop:checkout`, `orders:read`).
- R2.3 Users can see their connected apps and disconnect them. Disconnecting
  cuts access off immediately.
- R2.4 Every tool call checks the token, the connection, the scope and a rate
  limit, and is written to the audit log.

## R3. Shopping via Channel3 (`tests/channel3.test.ts`, `tests/shop-widget.test.ts`)

- R3.1 `search_products` calls Channel3 `/v1/search` with the API key header,
  a price filter and a limit (1–12).
- R3.2 Products are normalised to one shape: the cheapest in-stock offer,
  price in cents, the main image, the brand and the merchant.
- R3.3 `get_product` gets one product by id. An unknown id gives `product_not_found`.
- R3.4 Without an API key, a demo catalog keeps the app usable for judges.
- R3.5 Errors never leak the API key.

## R4. Canvas inside Claude, via MCP Apps (`tests/shop-widget.test.ts`, `tests/images.test.ts`)

- R4.1 `search_products` declares `_meta.ui.resourceUri = ui://payout/shop.html`.
- R4.2 The resource is a self-contained HTML document with the MCP Apps mime
  type (`text/html;profile=mcp-app`). The App SDK is inlined, with no CDN.
- R4.3 The canvas lets the user select products and quantities, then calls
  `create_checkout`, opens the PayPal link (`ui/open-link`) and polls
  `get_order_status`.
- R4.4 Merchant images load under a strict CSP through a signed `/img`
  proxy, which refuses unsigned, non-https, private and loopback targets.
- R4.5 All product data is rendered as text (no HTML injection from catalog data).

## R5. Pay with PayPal: Orders v2, sandbox (`tests/paypal.test.ts`, `tests/checkout.test.ts`, `tests/shop-api.test.ts`)

- R5.1 Gets a client-credentials token and caches it until shortly before it expires.
- R5.2 `create_checkout` re-prices every item from the catalog, ignoring any
  price the caller sends. It also merges duplicate items and rejects unknown,
  out-of-stock and non-USD items.
- R5.3 It creates an `intent: CAPTURE` order with itemised lines and
  `item_total`, sets `PayPal-Request-Id` for idempotency, and pre-fills the
  payer email if the user linked one. It returns the approval link.
- R5.4 `/paypal/return` captures the approved order and shows `/checkout/complete`.
  `/paypal/cancel` marks the order cancelled.
- R5.5 `get_order_status` syncs with PayPal and captures once the order is
  approved. Capturing an already-captured order is handled.
- R5.6 Users only ever see or capture their own orders (`list_orders`,
  `get_order_status`, `/api/orders`).
- R5.7 PayPal failures are reported as `paypal_error` or
  `paypal_not_configured`, and the order is marked FAILED. Credentials never
  appear in errors.

## R6. Frontend: Next.js

- R6.1 A landing page that explains the flow, plus signup and login (which
  respect `next`).
- R6.2 A dashboard with the connector URL and copy button, setup steps,
  connected apps, PayPal sandbox email link, and orders with status and a
  "Pay now" link.
- R6.3 Checkout result pages (complete or cancelled) that explain each
  backend error code.
- R6.4 Responsive, with no horizontal scroll at phone width, and dark-mode aware.
