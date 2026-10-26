"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/Card.js";
import { CopyButton } from "@/components/CopyButton.js";
import { AlertIcon, ChevronIcon, PlugIcon, SparkIcon, TerminalIcon } from "@/components/Icons.js";
import { Pill } from "@/components/StatusPill.js";

const SAMPLE_PROMPT = "Find me running shoes under $120 and show them so I can pick";

function isPublicHttps(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-medium text-cream">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-ink-soft">{children}</span>
    </li>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-cream px-1.5 py-0.5 font-medium text-ink">{children}</span>
);

export function ConnectCard({ mcpUrl, connected }: { mcpUrl: string | null; connected: boolean }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const url = mcpUrl ?? "";
  const cliCommand = `claude mcp add --transport http payout ${url || "<your MCP URL>"}`;
  const local = Boolean(url) && !isPublicHttps(url);

  return (
    <Card>
      <CardHeader
        icon={<PlugIcon />}
        title="Connect to Claude"
        description="Add Payout as a custom connector so Claude can search products and check you out."
        action={connected ? <Pill tone="green">Connected</Pill> : <Pill tone="amber">Not connected yet</Pill>}
      />
      <CardBody className="space-y-6">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your MCP connector URL</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-cream px-3.5 py-2.5 font-mono text-sm text-ink">
              {mcpUrl === null ? (
                <span className="inline-block h-4 w-56 animate-pulse rounded bg-line align-middle" />
              ) : (
                <span className="whitespace-nowrap">{url}</span>
              )}
            </div>
            <CopyButton text={url} label="Copy URL" className="sm:w-36" />
          </div>
          {local ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertIcon className="mt-px h-4 w-4" />
              <span>
                Claude can only reach a <strong>public HTTPS</strong> URL. When running locally, expose this server with a tunnel (for
                example ngrok or cloudflared) and set the public URL in your server config.
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">The URL must be public HTTPS so Claude can reach it.</p>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">On claude.ai or the Claude app</h3>
          <ol className="space-y-2.5">
            <Step n={1}>
              Open <Kbd>Settings</Kbd> → <Kbd>Connectors</Kbd>.
            </Step>
            <Step n={2}>
              Click <Kbd>Add custom connector</Kbd>, name it “Payout” and paste the URL above.
            </Step>
            <Step n={3}>
              Click <Kbd>Connect</Kbd>. You’ll land on Payout’s consent page.
            </Step>
            <Step n={4}>
              Review the access and click <Kbd>Allow</Kbd>. That’s it, you’re back in Claude.
            </Step>
          </ol>
        </div>

        <div className="rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setCodeOpen((v) => !v)}
            aria-expanded={codeOpen}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-cream focus-visible:outline-2 focus-visible:outline-ink"
          >
            <span className="flex items-center gap-2">
              <TerminalIcon className="h-4 w-4 text-muted-foreground" /> Using Claude Code instead?
            </span>
            <ChevronIcon className={`h-4 w-4 text-muted-foreground transition-transform ${codeOpen ? "rotate-180" : ""}`} />
          </button>
          {codeOpen ? (
            <div className="space-y-3 border-t border-line px-4 py-4">
              <p className="text-sm text-ink-soft">Run this in your terminal, then open Claude Code and use <code className="font-mono">/mcp</code> to sign in:</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink px-3.5 py-2.5 font-mono text-[13px] text-cream">
                  <code>{cliCommand}</code>
                </pre>
                <CopyButton text={cliCommand} label="Copy" variant="secondary" size="sm" className="h-10" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-cream p-4 ring-1 ring-line">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tan-ink">
            <SparkIcon className="h-4 w-4" /> Try this in Claude
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] font-medium text-ink">“{SAMPLE_PROMPT}”</p>
            <CopyButton text={SAMPLE_PROMPT} label="Copy prompt" variant="secondary" size="sm" className="self-start sm:self-auto" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
