# Payout

**Shop real stores from inside Claude or ChatGPT: search live Channel3 products, pay with PayPal Sandbox, and refund your own orders without leaving the chat.**

| [Live app](https://payout-xzgc.onrender.com) · [Inspiration](#inspiration) · [What it does](#what-it-does) · [How I built it](#how-i-built-it) · [Challenges](#challenges-i-ran-into) · [Accomplishments](#accomplishments-im-proud-of) · [What I learned](#what-i-learned) · [What's next](#whats-next) · [Built with](#built-with) · [Connect Claude or ChatGPT](#connect-claude-or-chatgpt) · [Architecture](#architecture) · [MCP tools](#mcp-tools) · [Configuration](#configuration) · [Run locally](#run-locally) · [Deploy on Render](#deploy-on-render) · [Checks](#checks) · [License](#license) |
| --- |

- **Live app:** https://payout-xzgc.onrender.com
- **MCP connector URL:** https://payout-xzgc.onrender.com/mcp

> **Test mode:** every payment and refund goes through PayPal Sandbox. No real money is charged and no item is shipped.

## Inspiration

I already ask Claude what to buy. It's good at it: it knows the trade-offs between two running shoes and remembers my budget. Then it hands me ten links, and I'm back to opening tabs, comparing prices and typing my card details into a site I've never heard of. The conversation stops right where the purchase starts.

I wanted the assistant to finish the job: find the real product, show me the real price, and let me pay in one step, with a way to get my money back if I change my mind.

## What it does

Payout is a connector you add to Claude or ChatGPT with one link.

1. **Sign up** on the site. There's one kind of account.
2. **Connect** by pasting the MCP link into Claude or ChatGPT and clicking **Allow**.
3. **Ask** something like "find me running shoes under $120". The results are live products from Channel3, with real prices, sizes and colours, and the budget is applied as a real price filter.
4. **Pay.** Payout re-checks the price with Channel3 and opens a PayPal checkout for exactly that amount.
5. **Refund.** Your orders show up in the dashboard, and you can refund all or part of a paid order yourself, from the dashboard or by asking the assistant.

If you don't use Claude or ChatGPT, the same search and checkout work in the browser at `/shop`.

## How I built it

- **MCP server** written with the official TypeScript SDK, so Claude, ChatGPT and Claude Code all talk to the same tools.
- **OAuth 2.1 sign-in** with PKCE, dynamic client registration and client metadata documents. That's what lets you connect with one link and an Allow button instead of copying API keys.
- **Channel3** for the product catalog, product details, similar items, price history and price alerts. Payout doesn't keep its own product list.
- **PayPal Orders v2** (Sandbox) for checkout, refunds and disputes, plus PayPal webhooks so an order flips to Paid or Refunded even if you close the tab.
- **Express + Next.js** for the API and web app, **Postgres + Drizzle** for accounts, connected apps, orders, refunds and alerts, and **Render** for hosting.

## Challenges I ran into

- **Getting the price right.** A price shown in chat can be stale by the time you pay. Payout fetches the price again from Channel3 when it creates the PayPal order, so you're charged what the store shows now, not what the assistant said a minute ago.
- **OAuth for AI apps.** Claude and ChatGPT each register themselves slightly differently. Making one sign-in flow work for both took more spec reading than any other part.
- **Deciding what the product is.** I went back and forth between a marketplace, a merchant store builder and a shopping assistant. I cut it down to one user, one catalog and one checkout, which made it much easier to explain and much harder to break.
- **Being honest about test mode.** It's easy to make a demo look like it ships products. Payout says on every checkout and order page that it's PayPal Sandbox, no real money moves and nothing ships.

## Accomplishments I'm proud of

- A real purchase works end to end on the live site: a live Channel3 product, a PayPal Sandbox payment, and a refund afterwards.
- Connecting takes one link and one click, with no API keys for the user.
- No fake data anywhere. If Channel3 isn't configured, search says so instead of showing made-up products.

## What I learned

- MCP plus OAuth is enough to turn any web service into something an assistant can use safely on your behalf.
- In a payment flow, the server has to own every number. The assistant can suggest, but the server decides the price and checks who owns the order before refunding it.
- Cutting features made the product better.

## What's next

- Real (live-mode) PayPal payments once fulfilment is solved, either through store partnerships or affiliate checkout.
- Shipping and delivery tracking in the chat.
- Live price-drop alerts delivered straight into the conversation.

## Built with

| Tool | What it does in Payout |
| --- | --- |
| [Channel3](https://trychannel3.com) | Every product, price, size, colour, similar item and price alert. |
| [PayPal](https://developer.paypal.com) (Sandbox) | Checkout, refunds, disputes and payment webhooks. |
| [Model Context Protocol](https://modelcontextprotocol.io) | The connector that Claude, ChatGPT and Claude Code use. |
| Claude / ChatGPT | Where you shop: both connect through the same MCP link. |
| [AG Studio](https://www.npmjs.com/package/ag-studio) | By AG Grid. The Analytics page: live totals, charts and a sortable orders table built from your real orders, refunds and price watches, with an editable dashboard. |
| Svix | Verifies Channel3 webhook signatures for price alerts. |
| Render | Hosts the app and its Postgres database. |

TypeScript, Node.js, Express, Next.js, React, Tailwind CSS, Postgres, Drizzle ORM.

---

# Technical details

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
