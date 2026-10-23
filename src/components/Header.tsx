"use client";

import type { ReactNode } from "react";
import { ButtonLink } from "./Button.js";
import { ArrowRightIcon } from "./Icons.js";
import { Logo } from "./Logo.js";
import { useMe } from "./useMe.js";

function AutoActions() {
  const me = useMe();
  if (me.status === "loading") return <div className="h-9 w-40" aria-hidden="true" />;
  if (me.status === "signed-in")
    return (
      <ButtonLink href="/dashboard" size="sm" className="h-9">
        Open dashboard <ArrowRightIcon className="h-4 w-4" />
      </ButtonLink>
    );
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <ButtonLink href="/login" variant="ghost" size="sm" className="h-9">
        Log in
      </ButtonLink>
      <ButtonLink href="/signup" size="sm" className="h-9">
        Create account
      </ButtonLink>
    </div>
  );
}

/** Shared top bar. Pass `actions` to replace the default sign-in-aware buttons. */
export function Header({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        {actions === undefined ? <AutoActions /> : actions}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
        <p>Payout · built for the PayPal AI Hackathon</p>
        <p className="text-xs">Payments run in PayPal Sandbox. No real money moves.</p>
      </div>
    </footer>
  );
}
