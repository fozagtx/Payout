"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Connection, type User } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Footer, Header } from "@/components/Header.js";
import { LogoutIcon, Spinner } from "@/components/Icons.js";
import { ConnectCard } from "./ConnectCard.js";
import { ConnectionsCard } from "./ConnectionsCard.js";
import { OrdersCard } from "./OrdersCard.js";
import { PayPalCard } from "./PayPalCard.js";

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

  const actions = user ? (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-2 text-sm text-slate-600 sm:flex dark:text-slate-300">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold uppercase text-white dark:bg-brand">
          {user.username.slice(0, 1)}
        </span>
        {user.username}
      </span>
      <Button variant="secondary" size="sm" className="h-9" onClick={logout} loading={loggingOut}>
        {loggingOut ? null : <LogoutIcon className="h-4 w-4" />} Log out
      </Button>
    </div>
  ) : null;

  return (
    <>
      <Header actions={actions} />
      <main className="flex-1">
        {fatal ? (
          <div className="mx-auto max-w-lg px-4 py-24 text-center">
            <h1 className="text-xl font-semibold">We couldn’t load your dashboard</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">{fatal}</p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : !user ? (
          <div className="flex justify-center py-32 text-slate-400" role="status" aria-label="Loading">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
            <div className="animate-rise mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-white">
                {greeting()}, {user.username}
              </h1>
              <p className="mt-1.5 text-slate-600 dark:text-slate-400">
                Connect Claude once, then shop by just asking. Your orders show up here.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-6">
                <ConnectCard
                  mcpUrl={connections.status === "ready" ? connections.mcpUrl : null}
                  connected={connections.status === "ready" && connections.connections.length > 0}
                />
                <OrdersCard />
              </div>
              <div className="space-y-6">
                <ConnectionsCard state={connections} reload={loadConnections} />
                <PayPalCard user={user} onChange={(paypalEmail) => setUser({ ...user, paypalEmail })} />
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
