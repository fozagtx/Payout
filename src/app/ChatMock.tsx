import { PayPalMark } from "@/components/Icons.js";

type Product = { name: string; merchant: string; price: string; hue: string; accent: string; selected?: boolean };

const products: Product[] = [
  { name: "Cloudrunner 4", merchant: "Stride Co.", price: "$109.00", hue: "#dbeafe", accent: "#0070e0", selected: true },
  { name: "Tempo Knit", merchant: "Pace Supply", price: "$94.99", hue: "#fef3c7", accent: "#f59e0b" },
  { name: "Trail Lite GTX", merchant: "Ridgeline", price: "$118.00", hue: "#dcfce7", accent: "#16a34a" },
];

function Shoe({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 120 64" className="h-full w-full" aria-hidden="true">
      <path d="M10 44c0-8 6-16 14-18l22-6c6-2 10-8 14-12 4 4 10 10 22 14 12 3 26 8 28 16v8H10v-2Z" fill={accent} />
      <path d="M10 46h100v6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-6Z" fill="#fff" stroke="#0f172a" strokeOpacity=".12" />
      <path d="M48 24l6 8M56 20l6 8M64 18l5 8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Static illustration of a Claude chat with the Payout product canvas. */
export function ChatMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand/25 via-sky-200/30 to-paypal/30 blur-2xl dark:from-brand/30 dark:via-navy/30 dark:to-paypal/10" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-navy/10 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate text-xs font-medium text-slate-400">Claude · New chat</span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 px-4 py-2.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            Find me running shoes under $120 and show them so I can pick.
          </div>

          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d97757] text-xs font-bold text-white">
              ✳
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Here are three highly rated options under $120. Pick what you like and check out with PayPal.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payout · 3 results</span>
                  <span className="rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-brand dark:bg-brand/20 dark:text-sky-300">
                    1 in cart
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {products.map((p) => (
                    <div
                      key={p.name}
                      className={`rounded-lg border bg-white p-1.5 dark:bg-slate-900 ${
                        p.selected ? "border-brand ring-2 ring-brand/30" : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex aspect-[4/3] items-center justify-center rounded-md p-1.5" style={{ background: p.hue }}>
                        <Shoe accent={p.accent} />
                      </div>
                      <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">{p.name}</p>
                      <p className="truncate text-[10px] text-slate-500">{p.merchant}</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">{p.price}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${
                            p.selected ? "bg-brand text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                          }`}
                        >
                          {p.selected ? "✓" : "+"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="text-xs text-slate-500">
                    Total <span className="ml-1 text-sm font-bold text-slate-900 dark:text-white">$109.00</span>
                  </div>
                  <div className="flex h-8 items-center gap-1.5 rounded-full bg-paypal px-4 text-xs font-bold text-navy shadow-sm">
                    <PayPalMark className="h-4 w-4" /> Pay with PayPal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
