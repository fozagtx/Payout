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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white dark:bg-brand">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</span>
    </li>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100">{children}</span>
);

export function ConnectCard({ mcpUrl, connected }: { mcpUrl: string | null; connected: boolean }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const url = mcpUrl ?? "";
  const cliCommand = `claude mcp add --transport http payout ${url || "<your MCP URL>"}`;
  const local = Boolean(url) && !isPublicHttps(url);

  return (
    <Card id="connect">
      <CardHeader
        icon={<PlugIcon />}
        title="Connect to Claude"
        description="Add Payout as a custom connector so Claude can search products and check you out."
        action={connected ? <Pill tone="green">Connected</Pill> : <Pill tone="amber">Not connected yet</Pill>}
      />
      <CardBody className="space-y-6">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Your MCP connector URL</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {mcpUrl === null ? (
                <span className="inline-block h-4 w-56 animate-pulse rounded bg-slate-200 align-middle dark:bg-slate-800" />
              ) : (
                <span className="whitespace-nowrap">{url}</span>
              )}
            </div>
            <CopyButton text={url} label="Copy URL" className="sm:w-36" />
          </div>
          {local ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
              <AlertIcon className="mt-px h-4 w-4" />
              <span>
                Claude can only reach a <strong>public HTTPS</strong> URL. When running locally, expose this server with a tunnel (for
                example ngrok or cloudflared) and set the public URL in your server config.
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">The URL must be public HTTPS so Claude can reach it.</p>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">On claude.ai or the Claude app</h3>
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

        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setCodeOpen((v) => !v)}
            aria-expanded={codeOpen}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand dark:text-slate-200 dark:hover:bg-slate-800/50"
          >
            <span className="flex items-center gap-2">
              <TerminalIcon className="h-4 w-4 text-slate-500" /> Using Claude Code instead?
            </span>
            <ChevronIcon className={`h-4 w-4 text-slate-500 transition-transform ${codeOpen ? "rotate-180" : ""}`} />
          </button>
          {codeOpen ? (
            <div className="space-y-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400">Run this in your terminal, then open Claude Code and use <code className="font-mono">/mcp</code> to sign in:</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3.5 py-2.5 font-mono text-[13px] text-slate-100 dark:bg-black">
                  <code>{cliCommand}</code>
                </pre>
                <CopyButton text={cliCommand} label="Copy" variant="secondary" size="sm" className="h-10" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-gradient-to-br from-sky to-white p-4 ring-1 ring-blue-100 dark:from-brand/15 dark:to-slate-900 dark:ring-brand/20">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand dark:text-sky-300">
            <SparkIcon className="h-4 w-4" /> Try this in Claude
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] font-medium text-navy dark:text-white">“{SAMPLE_PROMPT}”</p>
            <CopyButton text={SAMPLE_PROMPT} label="Copy prompt" variant="secondary" size="sm" className="self-start sm:self-auto" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
