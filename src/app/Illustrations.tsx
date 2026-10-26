import { PayPalMark } from "@/components/Icons.js";

/** Decorative product art for the landing page (not real catalog data). */
type Kind = "shoe" | "headphones" | "mug" | "backpack" | "watch";

export function ProductArt({ kind, className = "h-full w-full" }: { kind: Kind; className?: string }) {
  const common = { viewBox: "0 0 96 96", className, "aria-hidden": true } as const;
  switch (kind) {
    case "shoe":
      return (
        <svg {...common}>
          <ellipse cx="48" cy="74" rx="34" ry="4" fill="#2d2b28" opacity=".08" />
          <path d="M14 62c0-7 5-13 12-15l17-5c5-1.5 8-6 11-9 4 4 9 9 19 12 9 2.5 13 7 13 13v5H14v-1Z" fill="#e4553f" />
          <path d="M14 63h72v5a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-5Z" fill="#fbf9f3" stroke="#2d2b28" strokeOpacity=".12" />
          <path d="M44 43l5 7M51 39l5 7M58 36l4 7" stroke="#fbf9f3" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...common}>
          <ellipse cx="48" cy="80" rx="26" ry="3.5" fill="#2d2b28" opacity=".08" />
          <path d="M22 54V44a26 26 0 0 1 52 0v10" fill="none" stroke="#3a3936" strokeWidth="6" strokeLinecap="round" />
          <rect x="16" y="50" width="16" height="26" rx="7" fill="#3a3936" />
          <rect x="64" y="50" width="16" height="26" rx="7" fill="#3a3936" />
          <rect x="20" y="54" width="8" height="18" rx="4" fill="#57544e" />
          <rect x="68" y="54" width="8" height="18" rx="4" fill="#57544e" />
        </svg>
      );
    case "mug":
      return (
        <svg {...common}>
          <ellipse cx="44" cy="78" rx="24" ry="3.5" fill="#2d2b28" opacity=".08" />
          <path d="M66 42h4a9 9 0 0 1 0 18h-4" fill="none" stroke="#c9b48f" strokeWidth="5" />
          <path d="M22 34h44v34a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8V34Z" fill="#ecdfc8" />
          <path d="M22 34h44v7H22z" fill="#d9c7a6" />
          <path d="M36 22c0-4 4-4 4-8M46 22c0-4 4-4 4-8" stroke="#a9875b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "backpack":
      return (
        <svg {...common}>
          <ellipse cx="48" cy="82" rx="24" ry="3.5" fill="#2d2b28" opacity=".08" />
          <path d="M38 22a10 10 0 0 1 20 0" fill="none" stroke="#3f6b52" strokeWidth="4" />
          <rect x="24" y="22" width="48" height="58" rx="14" fill="#4f8565" />
          <rect x="32" y="50" width="32" height="22" rx="7" fill="#3f6b52" />
          <path d="M32 58h32" stroke="#e7d8bc" strokeWidth="2" />
        </svg>
      );
    case "watch":
      return (
        <svg {...common}>
          <ellipse cx="48" cy="84" rx="18" ry="3" fill="#2d2b28" opacity=".08" />
          <rect x="36" y="10" width="24" height="76" rx="8" fill="#d9cdb8" />
          <rect x="26" y="28" width="44" height="40" rx="13" fill="#2d2b28" />
          <rect x="30" y="32" width="36" height="32" rx="10" fill="#1c1b19" />
          <path d="M48 40v9l6 4" stroke="#ffc439" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}

const heroTiles: { kind: Kind; rotate: string; badge: string }[] = [
  { kind: "shoe", rotate: "-4deg", badge: "#e4553f" },
  { kind: "headphones", rotate: "2deg", badge: "#3f7ee8" },
  { kind: "mug", rotate: "-1deg", badge: "#a9875b" },
  { kind: "backpack", rotate: "3deg", badge: "#4f8565" },
  { kind: "watch", rotate: "-3deg", badge: "#2d2b28" },
];

export function HeroTiles() {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-4" aria-hidden="true">
      {heroTiles.map((tile, i) => (
        <div
          key={tile.kind}
          style={{ ["--r" as string]: tile.rotate, animationDelay: `${i * 0.4}s` }}
          className={`animate-float relative h-20 w-20 rounded-[22px] border border-line bg-paper p-2.5 shadow-[0_10px_30px_-14px_rgba(45,43,40,0.35)] sm:h-28 sm:w-28 ${i > 2 ? "hidden sm:block" : ""}`}
        >
          <ProductArt kind={tile.kind} />
          <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full ring-2 ring-paper" style={{ background: tile.badge }} />
        </div>
      ))}
    </div>
  );
}

export function ClaudeMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#d97757"
        d="M12 2.5l1.3 6.2 4.7-4.2-2.9 5.7 6.4-.6-5.9 2.6 5.9 2.6-6.4-.6 2.9 5.7-4.7-4.2-1.3 6.2-1.3-6.2-4.7 4.2 2.9-5.7-6.4.6 5.9-2.6-5.9-2.6 6.4.6L6 4.5l4.7 4.2z"
      />
    </svg>
  );
}

/** Floating brand chips around the hero, like app icons on a desk. */
export function FloatingChip({ children, className, rotate = "0deg" }: { children: React.ReactNode; className: string; rotate?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ ["--r" as string]: rotate }}
      className={`animate-float absolute hidden h-14 w-14 items-center justify-center rounded-[18px] border border-line bg-paper shadow-[0_12px_30px_-12px_rgba(45,43,40,0.3)] lg:flex ${className}`}
    >
      {children}
    </div>
  );
}

const rows: { kind: Kind; name: string; merchant: string; price: string; picked?: boolean }[] = [
  { kind: "shoe", name: "Road runner, knit upper", merchant: "running store", price: "$109.00", picked: true },
  { kind: "backpack", name: "Daypack 22L", merchant: "outdoor shop", price: "$84.00" },
  { kind: "watch", name: "GPS sport watch", merchant: "electronics", price: "$119.00" },
];

/** Illustration of the Payout canvas Claude renders in the chat. */
export function CanvasPreview() {
  return (
    <div className="mx-auto w-full max-w-md" aria-hidden="true">
      <div className="flex items-center gap-3 rounded-full border border-line bg-paper px-5 py-3.5 shadow-[0_10px_30px_-16px_rgba(45,43,40,0.35)]">
        <ClaudeMark className="h-5 w-5" />
        <span className="truncate text-[15px] text-ink">Running gear under $120</span>
      </div>
      <div className="mx-3 mt-3 overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="flex items-center justify-between border-b border-line bg-cream/70 px-4 py-2 font-mono text-[10.5px] tracking-wider text-muted uppercase">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Product
          </span>
          <span>Price</span>
        </div>
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-b-0">
            <div className={`h-10 w-10 shrink-0 rounded-lg border p-1 ${row.picked ? "border-ink bg-cream" : "border-line bg-cream/60"}`}>
              <ProductArt kind={row.kind} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{row.name}</p>
              <p className="font-mono text-[10.5px] text-muted">{row.merchant}</p>
            </div>
            <span className="font-mono text-[13px] text-ink">{row.price}</span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] ${row.picked ? "bg-ink text-cream" : "border border-line-strong text-muted"}`}>
              {row.picked ? "✓" : "+"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Illustration of the order Payout sends to PayPal. */
export function OrderPreview() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-paper p-4 shadow-[0_10px_30px_-16px_rgba(45,43,40,0.35)]" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10.5px] tracking-wider text-muted uppercase">Order · 2 items</p>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800 ring-1 ring-amber-200">awaiting payment</span>
      </div>
      <div className="mt-3 space-y-2 font-mono text-[12px] text-ink-soft">
        <div className="flex justify-between"><span>1 × Road runner</span><span>$109.00</span></div>
        <div className="flex justify-between"><span>1 × Wool socks</span><span>$14.00</span></div>
        <div className="flex justify-between border-t border-dashed border-line-strong pt-2 text-ink"><span>item_total</span><span>$123.00</span></div>
      </div>
      <div className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-paypal text-sm font-semibold text-navy">
        <PayPalMark className="h-4 w-4" /> Pay with PayPal
      </div>
    </div>
  );
}
