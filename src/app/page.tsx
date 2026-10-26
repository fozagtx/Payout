import { Footer, Header } from "@/components/Header.js";
import { BagIcon, ChatIcon, LinkIcon, PayPalMark, PlugIcon, ShieldIcon, TerminalIcon, UserIcon } from "@/components/Icons.js";
import { HeroCtas } from "./HeroCtas.js";
import { CanvasPreview, ClaudeMark, FloatingChip, HeroTiles, OrderPreview } from "./Illustrations.js";
import { PromptDock } from "./PromptDock.js";

const steps = [
  { icon: UserIcon, title: "Create an account", body: "Pick a username and password. No email, no social login." },
  { icon: LinkIcon, title: "Copy your MCP link", body: "Your dashboard has a personal connector URL ready to paste." },
  { icon: PlugIcon, title: "Connect in Claude", body: "Add Payout as a custom connector and approve access once." },
  { icon: ChatIcon, title: "Ask Claude to shop", body: "Browse, pick in the canvas, and pay with PayPal from the chat." },
];

const builtWith = [
  { name: "PayPal Orders v2", detail: "Sandbox checkout" },
  { name: "Channel3", detail: "Product search" },
  { name: "MCP + MCP Apps", detail: "Tools and in-chat canvas" },
  { name: "Claude", detail: "Your shopping assistant" },
];

function SectionHeading({ eyebrow, children, sub }: { eyebrow: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-[34px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink sm:text-5xl">{children}</h2>
      {sub ? <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Header showNav />
      <main className="flex-1 pb-28">
        <section className="bg-dots relative overflow-hidden">
          <FloatingChip className="top-24 left-[8%]" rotate="-8deg">
            <ClaudeMark className="h-7 w-7" />
          </FloatingChip>
          <FloatingChip className="top-52 left-[16%]" rotate="6deg">
            <span className="font-mono text-sm font-semibold text-ink">mcp</span>
          </FloatingChip>
          <FloatingChip className="top-24 right-[9%]" rotate="7deg">
            <PayPalMark className="h-7 w-7" />
          </FloatingChip>
          <FloatingChip className="top-56 right-[15%]" rotate="-5deg">
            <BagIcon className="h-6 w-6 text-tan-ink" />
          </FloatingChip>

          <div className="relative mx-auto max-w-5xl px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24 sm:pb-20">
            <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 font-mono text-[11px] tracking-wider text-ink-soft uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Claude connector · PayPal Sandbox
            </p>
            <h1 className="animate-rise mt-7 text-[44px] leading-[1.02] font-semibold tracking-[-0.055em] text-ink [animation-delay:60ms] sm:text-7xl md:text-[84px]">
              <span className="mark">Shop from Claude.</span>
              <br />
              <span className="mark">Pay with PayPal.</span>
            </h1>
            <p className="animate-rise mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-ink-soft [animation-delay:120ms] sm:text-lg">
              Ask Claude for anything. Pick products in an interactive canvas right in the chat, then check out with PayPal in one tap.
            </p>
            <div className="animate-rise mt-9 [animation-delay:180ms]">
              <HeroCtas center />
            </div>
            <div className="animate-rise mt-16 [animation-delay:260ms]">
              <HeroTiles />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <SectionHeading eyebrow="How it works" sub="Four steps and Claude becomes a storefront. Every price and order comes from the server, never the chat.">
            From question to <span className="mark">checkout</span>
          </SectionHeading>

          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-[28px] border border-line bg-paper p-6 sm:p-8">
              <p className="eyebrow">Discover</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Search every store from one chat</h3>
              <p className="mt-2 text-ink-soft">Claude searches the Channel3 catalog and renders results as a canvas you can pick from.</p>
              <div className="mt-8 flex flex-1 items-center rounded-[20px] bg-cream p-5 sm:p-8">
                <CanvasPreview />
              </div>
            </div>
            <div id="checkout" className="flex scroll-mt-20 flex-col rounded-[28px] border border-line bg-paper p-6 sm:p-8">
              <p className="eyebrow">Checkout</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Pay with PayPal, priced by the server</h3>
              <p className="mt-2 text-ink-soft">Payout builds a PayPal Orders v2 order from the real catalog price and hands you a pay link.</p>
              <div className="mt-8 flex flex-1 items-center rounded-[20px] bg-cream p-5 sm:p-8">
                <OrderPreview />
              </div>
            </div>
          </div>

          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-[22px] border border-line bg-paper p-5">
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-cream text-ink">
                    <step.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-semibold tracking-[-0.02em] text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-cream sm:p-8">
              <p className="font-mono text-[12px] tracking-[0.08em] text-tan uppercase">For Claude Code</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">One command to connect</h3>
              <p className="mt-2 max-w-md text-cream/70">Prefer the terminal? Your dashboard gives you the exact command with your MCP URL filled in.</p>
              <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 font-mono text-[13px]">
                <TerminalIcon className="h-4 w-4 shrink-0 text-tan" />
                <span className="truncate">
                  claude mcp add --transport http payout <span className="text-tan">&lt;your MCP URL&gt;</span>
                </span>
              </div>
            </div>
            <div className="rounded-[28px] border border-line bg-paper p-6 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <ShieldIcon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-ink">Sandbox by default</h3>
              <p className="mt-2 text-ink-soft">
                Payments run in PayPal Sandbox, so no real money moves. OAuth consent keeps every connector scoped to your account, and you can disconnect any app from the dashboard.
              </p>
            </div>
          </div>
        </section>

        <section id="built-with" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow text-center">Built with</p>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-line bg-line lg:grid-cols-4">
            {builtWith.map((item) => (
              <div key={item.name} className="bg-paper px-5 py-6 text-center">
                <p className="font-semibold tracking-[-0.02em] text-ink">{item.name}</p>
                <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="bg-dots rounded-[32px] border border-line bg-paper px-6 py-16 text-center sm:py-20">
            <h2 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink sm:text-5xl">
              Your next order is <span className="mark">one message</span> away
            </h2>
            <p className="mx-auto mt-4 max-w-md text-ink-soft">Create an account, connect Claude, and start shopping in under a minute.</p>
            <div className="mt-8">
              <HeroCtas center />
            </div>
          </div>
        </section>
      </main>
      <PromptDock />
      <Footer />
    </>
  );
}
