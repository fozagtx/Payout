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
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Claude">
      <path fill="#d97757" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

export function ChatGPTMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="ChatGPT">
      <path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
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
        <div className="flex items-center justify-between border-b border-line bg-cream/70 px-4 py-2 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
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
              <p className="font-mono text-[10.5px] text-muted-foreground">{row.merchant}</p>
            </div>
            <span className="font-mono text-[13px] text-ink">{row.price}</span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] ${row.picked ? "bg-ink text-cream" : "border border-line-strong text-muted-foreground"}`}>
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
        <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Order · 2 items</p>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800 ring-1 ring-amber-200">awaiting payment</span>
      </div>
      <div className="mt-3 space-y-2 font-mono text-[12px] text-ink-soft">
        <div className="flex justify-between"><span>1 × Road runner</span><span>$109.00</span></div>
        <div className="flex justify-between"><span>1 × Wool socks</span><span>$14.00</span></div>
        <div className="flex justify-between border-t border-dashed border-line-strong pt-2 text-ink"><span>Total</span><span>$123.00</span></div>
      </div>
      <div className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-paypal text-sm font-semibold text-navy">
        <PayPalMark className="h-4 w-4" /> Pay with PayPal
      </div>
    </div>
  );
}
