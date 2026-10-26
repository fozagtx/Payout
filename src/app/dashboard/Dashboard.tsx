"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Connection, type User } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { LogoutIcon, Spinner } from "@/components/Icons.js";
import { Logo } from "@/components/Logo.js";
import { ConnectCard } from "./ConnectCard.js";
import { ConnectionsCard } from "./ConnectionsCard.js";
import { OrdersCard } from "./OrdersCard.js";
import { PayPalCard } from "./PayPalCard.js";
import { sections, Sidebar, useCollapsed } from "./Sidebar.js";

export type ConnectionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; connections: Connection[]; mcpUrl: string };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<ConnectionsState>({ status: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const { collapsed, toggle } = useCollapsed();

  const loadConnections = useCallback(async () => {
    const result = await api<{ connections: Connection[]; mcpUrl: string }>("/api/connections");
    if (result.ok) {
      setConnections({ status: "ready", connections: result.data.connections ?? [], mcpUrl: result.data.mcpUrl ?? "" });
    } else if (result.status === 401) {
      window.location.assign("/login?next=%2Fdashboard");
    } else {
      setConnections({ status: "error", message: result.message });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const me = await api<{ user: User }>("/api/me");
      if (!me.ok) {
        if (me.status === 401) {
          window.location.assign("/login?next=%2Fdashboard");
          return;
        }
        setFatal(me.message);
        return;
      }
      setUser(me.data.user);
      void loadConnections();
    })();
  }, [loadConnections]);

  async function logout() {
    setLoggingOut(true);
    await api("/api/auth/logout", { method: "POST", body: {} });
    window.location.assign("/");
  }

  if (fatal) {
    return (
      <main className="bg-dots flex flex-1 items-center justify-center px-4 py-24 text-center">
        <div className="max-w-lg">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">We couldn’t load your dashboard</h1>
          <p className="mt-2 text-ink-soft">{fatal}</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-1 justify-center py-32 text-muted" role="status" aria-label="Loading">
        <Spinner className="h-6 w-6" />
      </main>
    );
  }

  const connected = connections.status === "ready" && connections.connections.length > 0;

  return (
    <div className="flex min-h-dvh">
      <Sidebar username={user.username} collapsed={collapsed} onToggle={toggle} onLogout={logout} loggingOut={loggingOut} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur-md lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Logo />
            <Button variant="secondary" size="sm" onClick={logout} loading={loggingOut}>
              {loggingOut ? null : <LogoutIcon className="h-4 w-4" />} Log out
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Dashboard">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[13px] text-ink-soft">
                <section.icon className="h-3.5 w-3.5" /> {section.label}
              </a>
            ))}
          </nav>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
            <div className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-[40px] sm:leading-[1.05]">
                  {greeting()}, <span className="mark">{user.username}</span>
                </h1>
                <p className="mt-3 text-ink-soft">Connect Claude once, then shop by just asking. Your orders show up here.</p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase ${
                  connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-paper text-ink-soft"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-muted"}`} />
                {connected ? "Claude connected" : "Not connected yet"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-5">
                <ConnectCard mcpUrl={connections.status === "ready" ? connections.mcpUrl : null} connected={connected} />
                <OrdersCard />
              </div>
              <div className="min-w-0 space-y-5">
                <ConnectionsCard state={connections} reload={loadConnections} />
                <PayPalCard user={user} onChange={(paypalEmail) => setUser({ ...user, paypalEmail })} />
              </div>
            </div>
          </div>
        </main>
        <footer className="border-t border-line px-4 py-6 font-mono text-[11px] tracking-wide text-muted uppercase sm:px-8">
          PayPal Sandbox · no real money moves
        </footer>
      </div>
    </div>
  );
}
