import { Footer, Header } from "@/components/Header.js";
import { BagIcon, ChatIcon, LinkIcon, UserIcon } from "@/components/Icons.js";
import { ChatMock } from "./ChatMock.js";
import { HeroCtas } from "./HeroCtas.js";

const steps = [
  {
    icon: <UserIcon />,
    title: "Create an account",
    body: "Pick a username and password. No email, no social login.",
  },
  {
    icon: <LinkIcon />,
    title: "Copy your MCP link",
    body: "Your dashboard has a connector URL made for Claude.",
  },
  {
    icon: <ChatIcon />,
    title: "Connect in Claude",
    body: "Settings → Connectors → Add custom connector, then approve access on Payout.",
  },
  {
    icon: <BagIcon />,
    title: "Ask Claude to shop",
    body: "Browse results in a canvas inside the chat, pick items, and pay with PayPal.",
  },
];

const builtWith = [
  { name: "PayPal Orders v2", detail: "Sandbox checkout" },
  { name: "Channel3", detail: "Product search" },
  { name: "MCP + MCP Apps", detail: "Tools and in-chat canvas" },
  { name: "Claude", detail: "Your shopping assistant" },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_10%_-10%,rgba(0,112,224,0.12),transparent),radial-gradient(40rem_20rem_at_90%_0%,rgba(255,196,57,0.18),transparent)] dark:bg-[radial-gradient(60rem_30rem_at_10%_-10%,rgba(0,112,224,0.25),transparent),radial-gradient(40rem_20rem_at_90%_0%,rgba(255,196,57,0.08),transparent)]"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-xs font-semibold text-brand shadow-sm dark:border-brand/40 dark:bg-slate-900/70 dark:text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-paypal" /> An MCP connector for Claude
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-6xl dark:text-white">
                Shop from Claude.
                <br />
                <span className="text-brand dark:text-sky-400">Pay with PayPal.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                Tell Claude what you need. Payout finds real products, shows them in an interactive canvas right in
                the chat, and checks you out securely with PayPal.
              </p>
              <div className="mt-8">
                <HeroCtas />
              </div>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Demo runs on PayPal Sandbox. No real charges.</p>
            </div>
            <div className="animate-rise [animation-delay:120ms]">
              <ChatMock />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-slate-200 bg-white py-16 sm:py-20 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl dark:text-white">
              From “find me…” to paid in four steps
            </h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="relative rounded-2xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white dark:bg-brand">
                      {step.icon}
                    </div>
                    <span className="text-3xl font-black text-slate-200 dark:text-slate-800">{index + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Built with</p>
            <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {builtWith.map((item) => (
                <li
                  key={item.name}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-center dark:border-slate-800 dark:bg-slate-900"
                >
                  <p className="font-semibold text-navy dark:text-white">{item.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-navy px-6 py-10 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to shop from your chat?</h2>
              <p className="mt-2 text-blue-100/80">Create an account, connect Claude, and try your first order in minutes.</p>
            </div>
            <HeroCtas onDark />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
