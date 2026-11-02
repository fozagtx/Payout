# Payout

Payout lets people search Channel3's live product catalog in Claude, ChatGPT, or the web shop, then check out with PayPal Sandbox. Prices and options are read from Channel3 when an order is created. Users can see their orders, request full or partial PayPal refunds themselves, set price alerts, compare products, and review their own order analytics.

All checkout and refund calls use PayPal Sandbox. No real money is charged and no item is shipped.

## How it works

1. Connect Claude or ChatGPT to the shared Payout MCP connector, or browse `/shop`.
2. Search Channel3 live and choose products, options, and quantities.
3. Payout rechecks current catalog prices and creates a PayPal Sandbox checkout.
4. Users manage their own orders, refunds, price alerts, and analytics from the dashboard.

Channel3 is the only product catalog. Payout does not have an in-app product catalog or merchant role. The Channel3 API key is optional for the server to start, but is required for product search.

## Request path

```text
Claude / ChatGPT / web shop
            │
            ▼
      Payout MCP + API ─────── Channel3 live catalog
            │
            ├──────────────── Postgres orders and price alerts
            │
            └──────────────── PayPal Sandbox checkout and refunds
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `search_products`, `get_product`, `get_product_details`, `find_similar_products` | Search and inspect Channel3 catalog products. |
| `compare_link` | Compare a product URL using Channel3. |
| `watch_price`, `list_price_watches` | Manage your price alerts. |
| `create_checkout`, `get_order_status`, `list_orders`, `list_disputes`, `refund_order` | Pay and manage your own orders through PayPal Sandbox. |
| `whoami`, `get_activity` | View your account identity and recent tool activity. |

## Configuration

Copy `.env.example` to `.env` and configure:

- `CHANNEL3_API_KEY`: required for live product search through Channel3.
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: PayPal Sandbox credentials used for checkout and refunds.
- `PAYPAL_WEBHOOK_ID`: optional webhook verification identifier.
- `SESSION_SECRET`: a long random secret for signed sessions.
- `DATABASE_URL`: PostgreSQL connection URL.
- `PUBLIC_API_URL`: public origin used for MCP and PayPal return links.

Never commit `.env` or credentials. The PayPal email saved in the dashboard only prefills the login on the PayPal Sandbox page.

## Local development

```sh
pnpm install
cp .env.example .env
# Set the required environment values in .env.
pnpm db:migrate
pnpm dev
```

The app starts on `http://localhost:4000`. PostgreSQL must be running and reachable through `DATABASE_URL` before migrating or starting the app.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

The end-to-end script exercises OAuth discovery and MCP requests against a running local server:

```sh
pnpm e2e
```
