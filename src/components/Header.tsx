"use client";

import type { ReactNode } from "react";
import { ButtonLink } from "./Button.js";
import { ArrowRightIcon } from "./Icons.js";
import { Link } from "./Link.js";
import { Logo } from "./Logo.js";
import { useMe } from "./useMe.js";

function AutoActions() {
  const me = useMe();
  if (me.status === "loading") return <div className="h-10 w-44" aria-hidden="true" />;
  if (me.status === "signed-in")
    return (
      <ButtonLink href="/dashboard" size="md">
        Open dashboard <ArrowRightIcon className="h-4 w-4" />
      </ButtonLink>
    );
  return (
    <div className="flex items-center gap-2">
      <ButtonLink href="/login" variant="secondary" size="md">
        Log in
      </ButtonLink>
      <ButtonLink href="/signup" size="md" className="hidden sm:inline-flex">
        Create account
      </ButtonLink>
    </div>
  );
}

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#checkout", label: "Checkout" },
  { href: "/#built-with", label: "Built with" },
];

/** Shared top bar. Pass `actions` to replace the default sign-in-aware buttons; `nav` shows the landing links. */
export function Header({ actions, showNav = false }: { actions?: ReactNode; showNav?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          {showNav ? (
            <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        {actions === undefined ? <AutoActions /> : actions}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line py-8 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
        <p>Payout · built for the PayPal AI Hackathon</p>
        <p className="font-mono text-[11px] tracking-wide uppercase">PayPal Sandbox · no real money moves</p>
      </div>
    </footer>
  );
}
