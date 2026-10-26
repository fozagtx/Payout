"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Connection, type User } from "@/components/api.js";
import { Spinner } from "@/components/Icons.js";
import { ConnectCard } from "./ConnectCard.js";
import { ConnectionsCard } from "./ConnectionsCard.js";
import { PayPalCard } from "./PayPalCard.js";
import type { ConnectionsState } from "./Dashboard.js";

export function DashboardHomePage() {
  const [connections, setConnections] = useState<ConnectionsState>({ status: "loading" });

  const load = useCallback(async () => {
    const result = await api<{ connections: Connection[]; mcpUrl: string }>("/api/connections");
    if (result.ok) setConnections({ status: "ready", connections: result.data.connections ?? [], mcpUrl: result.data.mcpUrl ?? "" });
    else setConnections({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-[36px] sm:leading-tight">Connect Claude</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft sm:text-base">Add Payout as a connector and try your first product search.</p>
      {connections.status === "error" ? <p className="mb-4 text-sm text-red-700">{connections.message}</p> : null}
      <ConnectCard
        mcpUrl={connections.status === "ready" ? connections.mcpUrl : null}
        connected={connections.status === "ready" && connections.connections.length > 0}
      />
    </section>
  );
}

export function DashboardAppsPage() {
  const [state, setState] = useState<ConnectionsState>({ status: "loading" });
  const reload = useCallback(async () => {
    const result = await api<{ connections: Connection[]; mcpUrl: string }>("/api/connections");
    if (result.ok) setState({ status: "ready", connections: result.data.connections ?? [], mcpUrl: result.data.mcpUrl ?? "" });
    else setState({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <ConnectionsCard state={state} reload={reload} />;
}

export function DashboardPayPalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await api<{ user: User }>("/api/me");
      if (result.ok) setUser(result.data.user);
      else setError(result.message);
    })();
  }, []);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!user) return <div className="flex justify-center py-16 text-muted-foreground" role="status" aria-label="Loading PayPal settings"><Spinner className="h-6 w-6" /></div>;
  return <PayPalCard user={user} onChange={(paypalEmail) => setUser({ ...user, paypalEmail })} />;
}
