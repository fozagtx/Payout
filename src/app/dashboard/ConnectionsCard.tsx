"use client";

import { useState } from "react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card, CardBody, CardHeader } from "@/components/Card.js";
import { formatShortDate } from "@/components/format.js";
import { ExternalIcon, LinkIcon } from "@/components/Icons.js";
import type { ConnectionsState } from "./Dashboard.js";

export function ConnectionsCard({ state, reload }: { state: ConnectionsState; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(id: string, name: string) {
    if (!window.confirm(`Disconnect ${name}? It will lose access to your Payout account.`)) return;
    setBusy(id);
    setError(null);
    const result = await api(`/api/connections/${encodeURIComponent(id)}/disconnect`, { method: "POST", body: {} });
    if (!result.ok) setError(result.message);
    await reload();
    setBusy(null);
  }

  return (
    <Card id="apps">
      <CardHeader
        icon={<LinkIcon />}
        title="Connected apps"
        description="AI apps that can shop on your behalf."
        action={
          <a
            href="/connections"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            Manage <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        }
      />
      <CardBody>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {state.status === "loading" ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-12 animate-pulse rounded-xl bg-cream" />
          </div>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-600">{state.message}</p>
        ) : state.connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
            <p className="text-sm font-medium text-ink-soft">No apps connected yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Follow the steps in “Connect to Claude” and it will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {state.connections.map((c) => {
              const name = c.clientName || "Unnamed app";
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d97757]/15 text-sm font-bold text-[#c2603f]">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Since {formatShortDate(c.createdAt)}
                        {c.scopes?.length ? ` · ${c.scopes.join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="danger" size="sm" loading={busy === c.id} onClick={() => disconnect(c.id, name)}>
                    Disconnect
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
