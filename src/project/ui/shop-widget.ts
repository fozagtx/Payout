import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * The MCP Apps canvas for the shop tools: one self-contained HTML document
 * (no CDN, the ext-apps App bundle is inlined). It switches on the tool
 * result's structuredContent: `{ products }` shows the product grid with
 * selection and "Pay with PayPal"; `{ order }` shows the order card.
 *
 * All data is rendered with textContent / attributes, never innerHTML.
 */

let cached: string | undefined;

/**
 * The ext-apps browser bundle ends with `export{... ,eI as App}`. An inline
 * module script can't be imported from, so the bundle is wrapped in a function
 * that returns the exports we use, keeping its top-level names out of our scope.
 */
function inlineAppBundle() {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
  const match = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(source);
  if (!match) throw new Error("ext-apps bundle: export clause not found");
  const exported = new Map<string, string>();
  for (const part of match[1]!.split(",")) {
    const [local, name = local] = part.trim().split(/\s+as\s+/);
    if (local) exported.set(name!.trim(), local.trim());
  }
  const wanted = ["App", "applyDocumentTheme", "applyHostStyleVariables", "applyHostFonts"];
  const missing = wanted.filter((name) => !exported.has(name));
  if (missing.length) throw new Error(`ext-apps bundle: missing exports ${missing.join(", ")}`);
  const body = source.slice(0, match.index);
  if (/<\/script|<!--|<script/i.test(body)) throw new Error("ext-apps bundle contains script-breaking text");
  const returned = wanted.map((name) => `${name}: ${exported.get(name)}`).join(", ");
  return `const McpApps = (() => {\n${body}\nreturn { ${returned} };\n})();`;
}

const STYLES = String.raw`
:root {
  color-scheme: light dark;
  --accent: #0070e0;
  --accent-strong: #005ea6;
  --accent-soft: rgba(0, 112, 224, 0.12);
  --paypal: #ffc439;
  --paypal-hover: #f2ba36;
  --paypal-ink: #111111;
  --bg: var(--color-background-primary, #ffffff);
  --surface: var(--color-background-secondary, #f6f7f9);
  --card: #ffffff;
  --text: var(--color-text-primary, #16181d);
  --muted: var(--color-text-secondary, #5d6470);
  --border: var(--color-border-primary, rgba(16, 24, 40, 0.12));
  --success: #13804b;
  --success-soft: rgba(19, 128, 75, 0.12);
  --warn: #9a6200;
  --warn-soft: rgba(219, 145, 0, 0.16);
  --danger: #c62828;
  --danger-soft: rgba(198, 40, 40, 0.1);
  --radius: 14px;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 2px 8px rgba(16, 24, 40, 0.06);
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: var(--color-background-primary, #17181c);
    --surface: var(--color-background-secondary, #1f2126);
    --card: #22252b;
    --text: var(--color-text-primary, #f1f2f4);
    --muted: var(--color-text-secondary, #a2a8b3);
    --border: var(--color-border-primary, rgba(255, 255, 255, 0.12));
    --accent: #4da3ff;
    --accent-strong: #7bbcff;
    --accent-soft: rgba(77, 163, 255, 0.16);
    --success: #4cc38a;
    --success-soft: rgba(76, 195, 138, 0.16);
    --warn: #f0b44c;
    --danger: #ff7a7a;
    --danger-soft: rgba(255, 122, 122, 0.12);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
}
:root[data-theme="dark"] {
  --bg: var(--color-background-primary, #17181c);
  --surface: var(--color-background-secondary, #1f2126);
  --card: #22252b;
  --text: var(--color-text-primary, #f1f2f4);
  --muted: var(--color-text-secondary, #a2a8b3);
  --border: var(--color-border-primary, rgba(255, 255, 255, 0.12));
  --accent: #4da3ff;
  --accent-strong: #7bbcff;
  --accent-soft: rgba(77, 163, 255, 0.16);
  --success: #4cc38a;
  --success-soft: rgba(76, 195, 138, 0.16);
  --warn: #f0b44c;
  --danger: #ff7a7a;
  --danger-soft: rgba(255, 122, 122, 0.12);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; color: var(--text); }
body { font-size: 14px; line-height: 1.4; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: default; opacity: 0.6; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.app { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.header h1 { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
.header .hint { color: var(--muted); font-size: 12.5px; }
.brandmark { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-weight: 700; }
.brandmark svg { width: 16px; height: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.card {
  position: relative; display: flex; flex-direction: column; text-align: left; padding: 0;
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; box-shadow: var(--shadow); transition: border-color .15s, box-shadow .15s, transform .15s;
}
.card:hover:not(.disabled) { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow); }
.card.disabled { opacity: 0.62; }
.card .media { position: relative; aspect-ratio: 1 / 1; background: var(--surface); display: flex; align-items: center; justify-content: center; }
.card .media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card .media .placeholder { color: var(--muted); font-size: 28px; }
.check {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 999px;
  background: rgba(255,255,255,0.92); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
  color: transparent; font-size: 14px; font-weight: 700; transition: background .15s, color .15s;
}
.card.selected .check { background: var(--accent); border-color: var(--accent); color: #fff; }
.badge {
  position: absolute; left: 8px; top: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: rgba(20, 20, 20, 0.78); color: #fff;
}
.badge.sale { background: var(--danger); }
.card .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
.brand { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.title { font-size: 13.5px; font-weight: 550; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.prices { display: flex; align-items: baseline; gap: 6px; margin-top: auto; padding-top: 4px; }
.price { font-size: 15px; font-weight: 700; }
.compare { font-size: 12px; color: var(--muted); text-decoration: line-through; }
.merchant { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stepper { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
.stepper button { border: 0; background: transparent; width: 32px; height: 28px; font-size: 16px; font-weight: 600; color: var(--accent); }
.stepper button:hover:not(:disabled) { background: var(--accent-soft); }
.stepper .qty { font-weight: 650; min-width: 24px; text-align: center; font-variant-numeric: tabular-nums; }
.footer {
  position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; margin: 0 -12px -12px; background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid var(--border);
}
.footer .summary { display: flex; flex-direction: column; }
.footer .count { font-size: 12px; color: var(--muted); }
.footer .total { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.paypal {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 180px; height: 42px;
  padding: 0 20px; border: 0; border-radius: 999px; background: #ffc439; color: var(--paypal-ink);
  font-weight: 700; font-size: 14.5px; transition: background .15s, transform .1s; white-space: nowrap;
}
.paypal:hover:not(:disabled) { background: var(--paypal-hover); }
.paypal:active:not(:disabled) { transform: scale(0.98); }
.paypal .pp { font-style: italic; font-weight: 800; letter-spacing: -0.02em; }
.paypal .pp b { color: #003087; }
.paypal .pp i { color: #0070e0; font-style: italic; }
.secondary {
  height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--card);
  font-weight: 600;
}
.secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.linkish { border: 0; background: none; color: var(--accent); padding: 0; font-weight: 600; }
.notice { padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.notice.error { background: var(--danger-soft); color: var(--danger); }
.notice.info { background: var(--accent-soft); color: var(--accent-strong); }
.empty { padding: 28px 12px; text-align: center; color: var(--muted); }
.skeleton { background: linear-gradient(90deg, var(--surface) 25%, color-mix(in srgb, var(--surface) 60%, var(--border)) 37%, var(--surface) 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; border-radius: 8px; }
.skel-card { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--card); }
.skel-card .skeleton.img { aspect-ratio: 1 / 1; border-radius: 0; }
.skel-card .lines { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.skel-card .line { height: 10px; }
@keyframes shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.order { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.order .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.order .top h2 { margin: 0; font-size: 15px; }
.order .ref { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 650; white-space: nowrap; }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill.pending { background: var(--warn-soft); color: var(--warn); }
.pill.approved { background: var(--accent-soft); color: var(--accent); }
.pill.paid { background: var(--success-soft); color: var(--success); }
.pill.cancelled { background: var(--surface); color: var(--muted); }
.lines { list-style: none; margin: 0; padding: 4px 16px; }
.line-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.line-item:last-child { border-bottom: 0; }
.line-item .thumb { width: 44px; height: 44px; border-radius: 8px; background: var(--surface); object-fit: cover; flex: none; }
.line-item .info { flex: 1; min-width: 0; }
.line-item .name { font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.line-item .meta { font-size: 12px; color: var(--muted); }
.line-item .amount { font-weight: 650; font-variant-numeric: tabular-nums; }
.order .totals { display: flex; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--border); font-weight: 700; font-size: 15px; }
.order .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px; align-items: center; }
.order .message { padding: 0 16px 12px; color: var(--muted); font-size: 13px; }
.success { display: flex; gap: 12px; align-items: center; padding: 14px 16px; background: var(--success-soft); color: var(--success); font-weight: 600; }
.success .tick { width: 28px; height: 28px; border-radius: 50%; background: var(--success); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; flex: none; }
.sandbox { font-size: 11px; color: var(--muted); text-align: center; }
@media (max-width: 420px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .paypal { min-width: 0; padding: 0 14px; }
  .footer { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

/** Client code. Plain JS, no backticks or template placeholders, no innerHTML with data. */
const CLIENT = String.raw`
const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = McpApps;
const root = document.getElementById("root");
const MAX_QTY = 10;

const state = {
  view: "idle",          // idle | loading | products | order | error
  loadingLabel: "",
  query: "",
  products: [],
  selection: new Map(),  // product id -> quantity
  order: null,
  busy: false,
  notice: null,          // { kind: "error" | "info", text }
};

const app = new App({ name: "Payout Shop", version: "1.0.0" }, {}, { autoResize: true });

function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of [].concat(children || [])) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function money(cents, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100);
  } catch (e) {
    return ((cents || 0) / 100).toFixed(2) + " " + (currency || "");
  }
}

function safeImageUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch (e) {
    return null;
  }
}

function image(url, className, alt) {
  const src = safeImageUrl(url);
  if (!src) return className === "thumb" ? el("div", { class: "thumb", "aria-hidden": "true" }) : el("div", { class: "placeholder", "aria-hidden": "true", text: "\u{1F6CD}" });
  const img = el("img", { src: src, alt: alt || "", loading: "lazy", referrerpolicy: "no-referrer", decoding: "async", class: className });
  img.addEventListener("error", function () {
    const fallback = el("div", { class: className === "thumb" ? "thumb" : "placeholder", "aria-hidden": "true", text: className === "thumb" ? "" : "\u{1F6CD}" });
    img.replaceWith(fallback);
  });
  return img;
}

function brandmark() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Zm3 0a3 3 0 0 1 6 0");
  svg.append(path);
  return el("span", { class: "brandmark" }, [svg, "Payout"]);
}

function paypalLabel(prefix) {
  return [prefix ? prefix + " " : "", el("span", { class: "pp" }, [el("b", { text: "Pay" }), el("i", { text: "Pal" })])];
}

function noticeNode() {
  if (!state.notice) return null;
  return el("div", { class: "notice " + state.notice.kind, role: state.notice.kind === "error" ? "alert" : "status", text: state.notice.text });
}

// ---------- products view ----------

function selectedLines() {
  const lines = [];
  for (const product of state.products) {
    const qty = state.selection.get(product.id);
    if (qty) lines.push({ product: product, quantity: qty });
  }
  return lines;
}

function toggle(product) {
  if (!product.inStock || state.busy) return;
  if (state.selection.has(product.id)) state.selection.delete(product.id);
  else state.selection.set(product.id, 1);
  state.notice = null;
  render();
  shareSelection();
}

function setQty(product, qty) {
  const next = Math.max(1, Math.min(MAX_QTY, qty));
  state.selection.set(product.id, next);
  render();
  shareSelection();
}

function productCard(product) {
  const qty = state.selection.get(product.id);
  const selected = Boolean(qty);
  const onSale = product.compareAtCents && product.compareAtCents > product.priceCents;
  const badge = !product.inStock
    ? el("span", { class: "badge", text: "Out of stock" })
    : onSale
      ? el("span", { class: "badge sale", text: "-" + Math.round(100 - (product.priceCents / product.compareAtCents) * 100) + "%" })
      : null;

  const body = el("div", { class: "body" }, [
    product.brand ? el("div", { class: "brand", text: product.brand }) : null,
    el("div", { class: "title", text: product.title, title: product.title }),
    el("div", { class: "prices" }, [
      el("span", { class: "price", text: money(product.priceCents, product.currency) }),
      onSale ? el("span", { class: "compare", text: money(product.compareAtCents, product.currency) }) : null,
    ]),
    product.merchant ? el("div", { class: "merchant", text: product.merchant }) : null,
  ]);

  if (selected) {
    const stop = function (event) { event.stopPropagation(); };
    body.append(
      el("div", { class: "stepper", onclick: stop, onkeydown: stop }, [
        el("button", { type: "button", "aria-label": "Decrease quantity", disabled: qty <= 1 || state.busy, onclick: function (e) { e.stopPropagation(); setQty(product, qty - 1); } }, "−"),
        el("span", { class: "qty", "aria-live": "polite", text: String(qty) }),
        el("button", { type: "button", "aria-label": "Increase quantity", disabled: qty >= MAX_QTY || state.busy, onclick: function (e) { e.stopPropagation(); setQty(product, qty + 1); } }, "+"),
      ])
    );
  }

  return el(
    "div",
    {
      class: "card" + (selected ? " selected" : "") + (product.inStock ? "" : " disabled"),
      role: "button",
      tabindex: product.inStock ? "0" : "-1",
      "aria-pressed": selected ? "true" : "false",
      "aria-disabled": product.inStock ? "false" : "true",
      "aria-label": product.title + ", " + money(product.priceCents, product.currency),
      onclick: function () { toggle(product); },
      onkeydown: function (event) {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(product); }
      },
    },
    [
      el("div", { class: "media" }, [image(product.imageUrl, "", product.title), badge, product.inStock ? el("span", { class: "check", "aria-hidden": "true", text: "✓" }) : null]),
      body,
    ]
  );
}

function productsView() {
  const nodes = [];
  nodes.push(
    el("div", { class: "header" }, [
      el("h1", {}, [brandmark(), state.query ? el("span", { text: " · “" + state.query + "”" }) : null]),
      el("span", { class: "hint", text: state.products.length ? "Tap items to add them, then pay with PayPal" : "" }),
    ])
  );
  if (!state.products.length) {
    nodes.push(el("div", { class: "empty", text: "No products found" + (state.query ? " for “" + state.query + "”" : "") + ". Try a different search." }));
    return nodes;
  }
  const notice = noticeNode();
  if (notice) nodes.push(notice);
  nodes.push(el("div", { class: "grid" }, state.products.map(productCard)));

  const lines = selectedLines();
  const count = lines.reduce(function (sum, line) { return sum + line.quantity; }, 0);
  const currency = lines.length ? lines[0].product.currency : (state.products[0] && state.products[0].currency) || "USD";
  const total = lines.reduce(function (sum, line) { return sum + line.quantity * line.product.priceCents; }, 0);
  nodes.push(
    el("div", { class: "footer" }, [
      el("div", { class: "summary" }, [
        el("span", { class: "count", text: count ? count + (count === 1 ? " item" : " items") : "No items selected" }),
        el("span", { class: "total", text: money(total, currency) }),
      ]),
      el(
        "button",
        { type: "button", class: "paypal", disabled: !count || state.busy, onclick: checkout, "aria-label": "Pay with PayPal" },
        state.busy ? [el("span", { class: "spinner", "aria-hidden": "true" }), "Starting checkout…"] : paypalLabel("Pay with")
      ),
      el("p", { class: "sandbox", text: "Test mode: no real money is charged and no item is shipped." }),
    ])
  );
  return nodes;
}

// ---------- order view ----------

function statusInfo(status) {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED" || s === "PAID" || s === "CAPTURED") return { key: "paid", label: "Paid" };
  if (s === "APPROVED") return { key: "approved", label: "Approved" };
  if (s === "CANCELLED" || s === "CANCELED" || s === "VOIDED" || s === "FAILED") return { key: "cancelled", label: s === "FAILED" ? "Failed" : "Cancelled" };
  return { key: "pending", label: "Awaiting payment" };
}

function orderView() {
  const order = state.order;
  const info = statusInfo(order.status);
  const nodes = [];
  nodes.push(el("div", { class: "header" }, [el("h1", {}, [brandmark()]), el("span", { class: "hint", text: "PayPal sandbox · test money only" })]));
  const notice = noticeNode();
  if (notice) nodes.push(notice);

  const items = Array.isArray(order.items) ? order.items : [];
  const card = el("div", { class: "order" });
  card.append(
    el("div", { class: "top" }, [
      el("div", {}, [el("h2", { text: info.key === "paid" ? "Order confirmed" : "Your order" }), el("div", { class: "ref", text: "Order " + String(order.id || "").slice(0, 8) })]),
      el("span", { class: "pill " + info.key, text: info.label }),
    ])
  );
  if (info.key === "paid") {
    card.append(el("div", { class: "success" }, [el("span", { class: "tick", "aria-hidden": "true", text: "✓" }), el("span", { text: "Payment received. Thanks for shopping with Payout!" })]));
  }
  card.append(
    el(
      "ul",
      { class: "lines" },
      items.map(function (line) {
        return el("li", { class: "line-item" }, [
          image(line.imageUrl, "thumb", ""),
          el("div", { class: "info" }, [
            el("div", { class: "name", text: line.title, title: line.title }),
            el("div", { class: "meta", text: line.quantity + " × " + money(line.unitCents, order.currency) }),
          ]),
          el("span", { class: "amount", text: money(line.unitCents * line.quantity, order.currency) }),
        ]);
      })
    )
  );
  card.append(el("div", { class: "totals" }, [el("span", { text: "Total" }), el("span", { text: money(order.totalCents, order.currency) })]));

  if (info.key === "pending" || info.key === "approved") {
    card.append(
      el("div", { class: "message", text: info.key === "approved" ? "Approved on PayPal. Confirm to complete the payment." : "Approve the payment on PayPal, then come back here." })
    );
    const actions = el("div", { class: "actions" });
    if (info.key === "pending" && order.approveUrl) {
      actions.append(el("button", { type: "button", class: "paypal", onclick: function () { openPayPal(order.approveUrl); }, disabled: state.busy }, paypalLabel("Open")));
    }
    actions.append(
      el(
        "button",
        { type: "button", class: "secondary", onclick: checkStatus, disabled: state.busy },
        state.busy ? [el("span", { class: "spinner", "aria-hidden": "true" }), " Checking…"] : info.key === "approved" ? "Complete payment" : "I’ve paid. Check status"
      )
    );
    if (state.products.length) {
      actions.append(el("button", { type: "button", class: "linkish", onclick: backToProducts, disabled: state.busy, text: "Change items" }));
    }
    card.append(actions);
  } else if (info.key === "cancelled") {
    card.append(el("div", { class: "message", text: "This checkout was cancelled. Nothing was charged." }));
    if (state.products.length) {
      card.append(el("div", { class: "actions" }, [el("button", { type: "button", class: "secondary", onclick: backToProducts, text: "Back to products" })]));
    }
  }
  nodes.push(card);
  nodes.push(el("div", { class: "sandbox", text: "Payments run in the PayPal sandbox. No real money moves." }));
  return nodes;
}

// ---------- loading / error ----------

function loadingView() {
  const nodes = [el("div", { class: "header" }, [el("h1", {}, [brandmark()]), el("span", { class: "hint", text: state.loadingLabel })])];
  if (state.view === "loading" && state.loadingKind === "search") {
    const grid = el("div", { class: "grid", "aria-hidden": "true" });
    for (let i = 0; i < 4; i++) {
      grid.append(el("div", { class: "skel-card" }, [el("div", { class: "skeleton img" }), el("div", { class: "lines" }, [el("div", { class: "skeleton line", style: "width:40%" }), el("div", { class: "skeleton line", style: "width:85%" }), el("div", { class: "skeleton line", style: "width:30%" })])]));
    }
    nodes.push(grid);
  } else {
    nodes.push(el("div", { class: "empty" }, [el("span", { class: "spinner", "aria-hidden": "true" }), " ", state.loadingLabel || "Loading…"]));
  }
  return nodes;
}

function render() {
  let nodes;
  if (state.view === "products") nodes = productsView();
  else if (state.view === "order" && state.order) nodes = orderView();
  else if (state.view === "error") nodes = [el("div", { class: "header" }, [el("h1", {}, [brandmark()])]), noticeNode()];
  else nodes = loadingView();
  root.replaceChildren(el("div", { class: "app" }, nodes));
}

// ---------- host interaction ----------

function errorText(content, fallback) {
  const code = content && content.code;
  const messages = {
    insufficient_scope: "This connection isn’t allowed to do that. Reconnect Payout and allow checkout.",
    rate_limited: "Too many requests. Wait a minute and try again.",
    connection_revoked: "This connection was revoked. Reconnect Payout in Claude.",
    product_not_found: "One of the products is no longer available.",
    catalog_unavailable: "Product search is unavailable right now.",
  };
  if (content && typeof content.message === "string" && content.message) return content.message;
  if (code && messages[code]) return messages[code];
  return code ? fallback + " (" + code + ")" : fallback;
}

function resultText(result) {
  const parts = (result && result.content) || [];
  for (const part of parts) if (part && part.type === "text" && part.text) return String(part.text).slice(0, 300);
  return "";
}

async function tellModel(text, structured) {
  try {
    if (typeof app.updateModelContext !== "function") return;
    await app.updateModelContext({ content: [{ type: "text", text: text }], structuredContent: structured });
  } catch (e) {
    // host may not support model context updates
  }
}

let shareTimer = null;
function shareSelection() {
  clearTimeout(shareTimer);
  shareTimer = setTimeout(function () {
    const lines = selectedLines();
    const items = lines.map(function (l) { return { product_id: l.product.id, title: l.product.title, quantity: l.quantity, unit_price: money(l.product.priceCents, l.product.currency) }; });
    const text = lines.length
      ? "In the Payout product grid the user has selected: " + lines.map(function (l) { return l.quantity + " × " + l.product.title + " (" + money(l.product.priceCents, l.product.currency) + " each, id " + l.product.id + ")"; }).join("; ") + "."
      : "The user has no products selected in the Payout product grid.";
    tellModel(text, { selection: items });
  }, 400);
}

async function openPayPal(url) {
  if (!url) return;
  try {
    const opened = await app.openLink({ url: url });
    if (opened && opened.isError) throw new Error("denied");
  } catch (e) {
    state.notice = { kind: "info", text: "Couldn’t open PayPal automatically. Use the “Open PayPal” button." };
    render();
  }
}

async function checkout() {
  const lines = selectedLines();
  if (!lines.length || state.busy) return;
  state.busy = true;
  state.notice = null;
  render();
  try {
    const result = await app.callServerTool({
      name: "create_checkout",
      arguments: { items: lines.map(function (l) { return { product_id: l.product.id, quantity: l.quantity }; }) },
    });
    const content = (result && result.structuredContent) || {};
    if (result.isError || !content.order) {
      state.notice = { kind: "error", text: errorText(content, resultText(result) || "Couldn’t start the PayPal checkout.") };
      return;
    }
    state.order = content.order;
    state.view = "order";
    state.notice = null;
    tellModel(
      "The user started a PayPal checkout from the Payout grid: order " + content.order.id + ", total " + money(content.order.totalCents, content.order.currency) + ", status " + content.order.status + ". They approve it on PayPal; call get_order_status with order_id " + content.order.id + " to check.",
      { order: { id: content.order.id, status: content.order.status, totalCents: content.order.totalCents, currency: content.order.currency } }
    );
    state.busy = false;
    render();
    await openPayPal(content.order.approveUrl);
  } catch (e) {
    state.notice = { kind: "error", text: "Couldn’t start the PayPal checkout. " + (e && e.message ? e.message : "") };
  } finally {
    state.busy = false;
    render();
  }
}

async function checkStatus() {
  if (!state.order || state.busy) return;
  state.busy = true;
  state.notice = null;
  render();
  try {
    const result = await app.callServerTool({ name: "get_order_status", arguments: { order_id: state.order.id } });
    const content = (result && result.structuredContent) || {};
    if (result.isError || !content.order) {
      state.notice = { kind: "error", text: errorText(content, resultText(result) || "Couldn’t check the payment status.") };
      return;
    }
    const before = statusInfo(state.order.status).key;
    state.order = content.order;
    const after = statusInfo(state.order.status).key;
    if (after === "pending") state.notice = { kind: "info", text: "PayPal hasn’t received your approval yet. Finish on PayPal, then check again." };
    if (after !== before) {
      tellModel("Payout order " + state.order.id + " is now " + state.order.status + ".", { order: { id: state.order.id, status: state.order.status } });
    }
  } catch (e) {
    state.notice = { kind: "error", text: "Couldn’t check the payment status. " + (e && e.message ? e.message : "") };
  } finally {
    state.busy = false;
    render();
  }
}

function backToProducts() {
  state.view = "products";
  state.notice = null;
  render();
}

function showContent(content, isError) {
  content = content || {};
  if (isError) {
    state.view = state.products.length ? "products" : "error";
    state.notice = { kind: "error", text: errorText(content, "Something went wrong.") };
  } else if (Array.isArray(content.products)) {
    state.products = content.products;
    state.query = typeof content.query === "string" ? content.query : state.query;
    const ids = new Set(content.products.map(function (p) { return p.id; }));
    for (const id of Array.from(state.selection.keys())) if (!ids.has(id)) state.selection.delete(id);
    state.view = "products";
    state.notice = null;
  } else if (content.order) {
    state.order = content.order;
    state.view = "order";
    state.notice = null;
  } else if (content.product) {
    state.products = [content.product];
    state.view = "products";
  }
  render();
}

app.ontoolinput = function (params) {
  const args = (params && params.arguments) || {};
  state.notice = null;
  if (typeof args.query === "string") {
    state.loadingKind = "search";
    state.query = args.query;
    state.loadingLabel = "Searching for “" + args.query + "”…";
  } else if (Array.isArray(args.items)) {
    state.loadingKind = "checkout";
    state.loadingLabel = "Preparing your PayPal checkout…";
  } else if (args.order_id) {
    state.loadingKind = "status";
    state.loadingLabel = "Checking your payment…";
  } else {
    state.loadingKind = "other";
    state.loadingLabel = "Loading…";
  }
  if (state.view === "idle" || state.view === "loading" || state.loadingKind === "search") {
    state.view = "loading";
    render();
  }
};

app.ontoolresult = function (params) {
  showContent(params && params.structuredContent, Boolean(params && params.isError));
};

app.ontoolcancelled = function () {
  if (state.view === "loading") {
    state.view = "error";
    state.notice = { kind: "info", text: "Cancelled." };
    render();
  }
};

function applyHost(ctx) {
  if (!ctx) return;
  try {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
  } catch (e) {
    // styling is best effort
  }
}

app.onhostcontextchanged = function (ctx) { applyHost(ctx); };
app.onteardown = async function () { return {}; };

state.view = "loading";
state.loadingKind = "search";
state.loadingLabel = "Loading…";
render();

try {
  await app.connect();
  applyHost(app.getHostContext());
} catch (e) {
  state.view = "error";
  state.notice = { kind: "error", text: "Couldn’t connect to the chat host." };
  render();
}
`;

export function renderShopWidgetHtml(): string {
  if (cached) return cached;
  cached = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Payout shop</title>",
    `<style>${STYLES}</style>`,
    "</head>",
    "<body>",
    '<div id="root"></div>',
    '<script type="module">',
    inlineAppBundle(),
    CLIENT,
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
  return cached;
}
