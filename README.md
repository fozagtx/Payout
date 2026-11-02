# Payout

Shop real stores from inside Claude or ChatGPT, and pay with PayPal without leaving the chat.

Payout is a remote MCP server plus a web app. Anyone who signs up can add Payout's connector link to Claude or ChatGPT, the assistant can search Channel3's live product catalog, show real prices, open a PayPal checkout and refund the order later. The same search and checkout also work in the browser at `/shop`.

> **Test mode:** every payment and refund goes through PayPal Sandbox. No real money is charged and no item is shipped.

- **Live app:** https://payout-xzgc.onrender.com
- **MCP connector:** https://payout-xzgc.onrender.com/mcp

## How it works

1. **Sign up** on the site. There is one type of account, with no buyer or merchant roles.
2. **Connect your AI** using the steps on the dashboard's Connect page. You can also skip this and use the web shop.
3. **Search.** Try "Find me running shoes under $120". Results come live from Channel3. The assistant passes your budget as a price limit, and the web shop reads "under $120" straight from what you type.
4. **Pay.** Payout checks the current Channel3 price again, then opens a PayPal Sandbox checkout for that amount.
5. **Manage your orders.** The dashboard shows your orders, lets you refund all or part of any paid order through PayPal, and holds price alerts and analytics.

Channel3 is the only catalog. Payout doesn't store its own products; Postgres holds only accounts, connected apps, orders and their refunds, price alerts and webhook events.

## Connect Claude or ChatGPT

Copy your connector URL from the dashboard's **Connect Claude** page.

**Claude** (custom connectors need a paid plan)
1. Open Settings → Connectors.
2. Click **Add custom connector**, name it `Payout` and paste the URL.
3. Click **Connect**, review the access on Payout's consent page, then click **Allow**.

**ChatGPT** (Plus/Pro)
Settings → Apps & Connectors → Advanced settings → turn on Developer mode → Create connector → paste the URL → Authentication: OAuth → sign in to Payout and click **Allow**.

**Claude Code**
```sh
claude mcp add --transport http payout https://payout-xzgc.onrender.com/mcp
```

Sign-in uses OAuth 2.1 with PKCE, dynamic client registration and client metadata documents.

## Architecture

```text
Claude / ChatGPT ──MCP──┐
                        ▼
Web shop (/shop) ──► Payout (Express + Next.js) ──► Channel3 live catalog
                        │
                        ├──► Postgres (users, orders, refunds, price alerts)
                        │
                        └──► PayPal Sandbox (Orders v2 checkout, refunds, disputes)
```

PayPal and Channel3 webhooks (`/paypal/webhook`, `/channel3/webhook`) move orders to Paid or Refunded and fire price alerts, even if the buyer closes the tab.

## MCP tools

| Tool | What it does |
| --- | --- |
| `search_products` | Search Channel3 by text, with an optional maximum price. |
| `get_product`, `get_product_details` | Show a product with its sizes, colours, store prices and price history. |
| `find_similar_products` | Find similar items. |
| `compare_link` | Paste a product link to compare prices across stores. |
| `watch_price`, `list_price_watches` | Get alerts when a price drops or an item is back in stock. |
| `create_checkout` | Create a PayPal Sandbox checkout at the current price. |
| `get_order_status`, `list_orders` | Check your orders. |
| `refund_order` | Refund all or part of one of your paid orders. |
| `list_disputes` | List PayPal disputes on your orders. |
| `whoami`, `get_activity` | Show your account and recent tool calls. |

## Configuration

Copy `.env.example` to `.env`. Only the first three variables are needed for a working shop.

| Variable | Needed for |
| --- | --- |
| `CHANNEL3_API_KEY` | Product search. Without it, search reports "not configured" and no products are shown. Get a key at https://trychannel3.com. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Checkout and refunds. Use a PayPal **sandbox** REST app from https://developer.paypal.com/dashboard/applications/sandbox. |
| `SESSION_SECRET` | Signs the session cookie. Generate one with `openssl rand -base64 32`. Render creates it for you. |
| `DATABASE_URL` | Optional. If it isn't set, Payout starts a bundled Postgres in `.data/postgres`. On Render that data is lost on every restart, so paste your Render Postgres Internal URL here. Tables live in their own `payout` schema. |
| `PUBLIC_API_URL` | The public origin used for MCP and PayPal return links. Defaults to `RENDER_EXTERNAL_URL` on Render, or `http://localhost:4000`. |
| `PAYPAL_WEBHOOK_ID` | Optional. ID of a webhook pointed at `<PUBLIC_API_URL>/paypal/webhook`. |
| `CHANNEL3_WEBHOOK_SECRET` | Optional. The `whsec_` secret for `<PUBLIC_API_URL>/channel3/webhook`, used for price alerts. |
| `TRUST_PROXY` | `1` behind Render, Fly or Railway. |

Never commit `.env` or any credentials.

## Run locally

```sh
pnpm install
cp .env.example .env   # add your keys
pnpm db:migrate
pnpm dev               # http://localhost:4000
```

Claude and ChatGPT have to reach the server, so expose it with a tunnel such as `cloudflared tunnel --url http://localhost:4000` and set `PUBLIC_API_URL` to the tunnel URL.

To pay in the sandbox, use a PayPal sandbox buyer account or a test card from PayPal's [card generator](https://developer.paypal.com/tools/sandbox/card-testing/), then click **Pay now as guest**.

## Deploy on Render

`render.yaml` defines a single Node web service. Create it from the blueprint, fill in `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and (recommended) `DATABASE_URL`, then deploy. Migrations run on each start.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm e2e   # OAuth discovery + MCP calls against a running server
```

## License

See [LICENSE](LICENSE).
