"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon } from "@/components/Icons.js";
import { ClaudeMark } from "./Illustrations.js";

const PROMPT = "Find me running shoes under $120 and show them so I can pick";

/** Bottom dock with a copyable starter prompt for Claude. */
export function PromptDock() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center px-4">
      <button
        type="button"
        onClick={copy}
        className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-full border border-line bg-paper/95 py-2.5 pr-3 pl-4 text-left shadow-[0_18px_40px_-18px_rgba(45,43,40,0.45)] backdrop-blur transition hover:border-line-strong focus-visible:outline-2 focus-visible:outline-ink"
      >
        <ClaudeMark className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-muted">{PROMPT}</span>
        <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-cream px-3 font-mono text-[11px] tracking-wide text-ink-soft uppercase">
          {copied ? (
            <>
              <CheckIcon className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              Copy <ArrowRightIcon className="h-3.5 w-3.5" />
            </>
          )}
        </span>
      </button>
      <p className="mt-1.5 text-[11px] text-muted">Paste it into Claude once Payout is connected</p>
    </div>
  );
}
