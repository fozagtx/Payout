# Payout

**Shop from Claude. Pay with PayPal.**

Payout is a remote MCP server with its own accounts. You create an account
(username and password), copy your connector URL from the dashboard into Claude,
and click **Allow**. After that you shop by asking:

> "Find me running shoes under $120 and show them so I can pick."

Claude searches real products through **Channel3** and renders them as an
interactive **canvas inside the chat** (an MCP App). You select items and set
quantities, then press **Pay with PayPal**. Payout creates a **PayPal Orders v2**
order (sandbox) for the exact items and prices, and you approve it on PayPal.
The payment is captured when you return, and the order appears in Claude and
on your dashboard.

Built for the [PayPal AI Hackathon](https://paypal-ai.devpost.com/).

## How it works

```text
 Claude (claude.ai / desktop / mobile)
   │  1. Add custom connector: https://<your-domain>/mcp
   │  2. OAuth sign-in: Payout login → consent page → Allow
   ▼
 Payout (one Node process, one origin)
   ├─ Next.js pages      /, /signup, /login, /dashboard, /checkout/*
   ├─ JSON API           /api/auth/*, /api/me, /api/connections, /api/orders
   ├─ MCP kit            /mcp, OAuth 2.1 + PKCE, CIMD + DCR, consent, audit log
   └─ tools
        search_products ──► Channel3 /v1/search   ─┐
        get_product     ──► Channel3 /v1/products  │ renders ui://payout/shop.html
        create_checkout ──► PayPal  /v2/checkout/orders (sandbox)
        get_order_status──► PayPal  GET order → capture when APPROVED
        list_orders, whoami, get_activity
   ▲
   │  3. Buyer approves on PayPal → /paypal/return?token=… → capture → /checkout/complete
 PayPal Sandbox
```

### Where the AI comes in

- **Claude is the shopping agent.** It turns "something warm for hiking under
  $80" into Channel3 searches, compares the results, and explains trade-offs.
  It calls `create_checkout` only after you have confirmed the items and the
  total.
- **The canvas (MCP Apps)** keeps a human in the loop. The product grid is
  rendered inside Claude, and your selection is reported back to the model
  (`ui/update-model-context`), so Claude knows what you picked.
- **Channel3's "default" search mode** combines lexical and semantic search
  over millions of products.

### Where PayPal comes in

- **Orders v2 (sandbox)**: create with `intent: CAPTURE` and an itemised
  `purchase_units` (`item_total` breakdown), an approval link
  (`payer-action`/`approve`), capture, and status sync.
- **Idempotency**: `PayPal-Request-Id` is set to our order id.
- **Prices are never taken from the AI**: `create_checkout` re-prices every
  item from Channel3 on the server before creating the PayPal order.
- **Optional PayPal link**: you can link your PayPal sandbox buyer email on
  the dashboard to pre-fill the PayPal login (`payment_source.paypal.email_address`).
- Money only moves after you approve on PayPal. Checkout has its own OAuth
  scope (`shop:checkout`).
- You can also add PayPal's own MCP server (`https://mcp.sandbox.paypal.com/http`)
  in Claude next to Payout, for invoices and refunds.

## Run it

Requires Node 22+, pnpm and Postgres 16.

```bash
git clone https://github.com/fozagtx/Payout.git && cd Payout
pnpm install
cp .env.example .env            # then set SESSION_SECRET (openssl rand -base64 32)
docker compose up -d            # Postgres on :5434 (or use your own DATABASE_URL)
pnpm db:migrate
pnpm dev                        # http://localhost:4000
```

- **`CHANNEL3_API_KEY`**: get one at [trychannel3.com](https://trychannel3.com)
- **`CHANNEL3_WEBHOOK_SECRET`** (optional): Channel3 Svix signing secret (starts with `whsec_`) for price and availability webhooks. In the Channel3 dashboard webhook portal, register `<PUBLIC_API_URL>/channel3/webhook` and set its signing secret here.

Channel3 earnings use `brand_name` as the merchant and the SDK's `order_amount` / `commission_amount` as dollar amounts. The current SDK transaction declaration has no currency field, so Payout uses a response currency when provided and otherwise falls back to USD, matching the storefront locale.
  (1,000 free credits a month). It powers Claude's search and the `/shop` page
  (text and photo search, filters, product pages with variants, store comparison,
  price history, similar products). Without a key, Claude gets a built-in demo
  catalog and `/shop` says search isn't set up.
- **`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`**: from a sandbox REST app at
  [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox).
  Pay with one of your sandbox *personal* accounts. PayPal asks the buyer for a
  delivery address, which shows on the order in the dashboard, and paid orders
  can be refunded from there.
- **`PAYPAL_WEBHOOK_ID`** (optional): in the same sandbox app, add a webhook for
  `<PUBLIC_API_URL>/paypal/webhook` with the events `CHECKOUT.ORDER.APPROVED`,
  `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` and
  `PAYMENT.CAPTURE.REFUNDED`, then paste its id here. Orders then update on
  their own even when the buyer closes the PayPal tab.

Production: `pnpm build && pnpm start`. To deploy on Render, use the included
`render.yaml` (a web service; it sets `PUBLIC_API_URL` from
`RENDER_EXTERNAL_URL`). `DATABASE_URL` is optional: left empty, Payout starts a
bundled Postgres (the `embedded-postgres` package) with its data in `.data/postgres`, which
Render wipes on every redeploy or restart. For data that sticks, paste the Internal URL of
your existing Render Postgres. Payout keeps its tables in a separate `payout` schema,
so it can share a database with other apps.

### Connect it to Claude

Claude reaches your server from the internet, so it needs public HTTPS. When
running locally:

```bash
cloudflared tunnel --url http://localhost:4000
# set PUBLIC_API_URL=<tunnel url> in .env and restart
```

1. Sign up at `<PUBLIC_API_URL>/signup`. The dashboard shows your connector URL.
2. In Claude: **Settings → Connectors → Add custom connector**, paste
   `<PUBLIC_API_URL>/mcp`, then click **Connect**, sign in and **Allow**.
3. Ask Claude to find something. Pick items in the canvas, then click
   **Pay with PayPal** and approve with a sandbox buyer account.

Claude Code: `claude mcp add --transport http payout <PUBLIC_API_URL>/mcp`.
Claude Code shows text results, not the canvas.

## Tests

The tests were written first for every slice. They cover the requirements in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

```bash
pnpm test        # 104 unit + integration tests (needs Postgres; TEST_DATABASE_URL, default mcp_test on :5434)
pnpm typecheck
pnpm e2e         # against a running dev server: discovery → signup → consent → tokens → tools → security checks
```

## Tools

| Tool | Scope | What it does |
|---|---|---|
| `search_products` | `shop:browse` | Searches Channel3 and shows the product canvas |
| `get_product` | `shop:browse` | Product details by id |
| `create_checkout` | `shop:checkout` | Re-prices items and creates a PayPal sandbox order; returns the approval link |
| `get_order_status` | `orders:read` | Syncs with PayPal and captures once approved |
| `list_orders` | `orders:read` | The user's orders, newest first |
| `whoami`, `get_activity` | – | Profile and audit log of this connection |

## Project layout

```text
server.ts                 Express (MCP kit + API) in front of Next.js, one origin
src/app/, src/components/ Next.js pages (landing, auth, dashboard, checkout result)
src/mcp-kit/              OAuth + /mcp engine (from agenthuman-ux-blueprint)
src/project/
  api/                    auth, connections, shop (orders + PayPal return), image proxy
  channel3/               Channel3 client + demo catalog
  paypal/                 PayPal Orders v2 client
  orders.ts               pricing, create, capture, cancel
  tools/                  MCP tools
  ui/                     the MCP App canvas (shop-widget.ts)
migrations/               SQL migrations
tests/                    vitest
scripts/e2e.mjs           end-to-end OAuth + tools flow
```

## Credits

The OAuth and MCP layer is based on
[agenthuman-ux-blueprint](https://github.com/fozagtx/agenthuman-ux-blueprint).
Product data comes from Channel3. Payments use PayPal Sandbox.

MIT licensed.
