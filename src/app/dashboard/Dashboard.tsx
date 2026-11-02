"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@/components/Link.js";
import { usePathname } from "next/navigation.js";
import { api, type Connection, type User } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { LogoutIcon, Spinner } from "@/components/Icons.js";
import { Logo } from "@/components/Logo.js";
import { merchantSections, sections, Sidebar, useCollapsed } from "./Sidebar.js";

export type ConnectionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; connections: Connection[]; mcpUrl: string };

export function Dashboard({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const { collapsed, toggle } = useCollapsed();

  const loadUser = useCallback(async () => {
    const me = await api<{ user: User }>("/api/me");
    if (me.ok) {
      setUser(me.data.user);
      return;
    }
    if (me.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setFatal(me.message);
  }, [pathname]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function logout() {
    setLoggingOut(true);
    await api("/api/auth/logout", { method: "POST", body: {} });
    window.location.assign("/");
  }

  if (fatal) {
    return (
      <main className="bg-dots flex min-h-dvh flex-1 items-center justify-center px-4 py-24 text-center">
        <div className="max-w-lg">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">We couldn’t load your dashboard</h1>
          <p className="mt-2 text-ink-soft">{fatal}</p>
          <Button className="mt-6" onClick={() => void loadUser()}>Try again</Button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-dvh flex-1 justify-center py-32 text-muted-foreground" role="status" aria-label="Loading dashboard">
        <Spinner className="h-6 w-6" />
      </main>
    );
  }

  const navSections = user.role === "merchant" ? [...sections, ...merchantSections] : sections;
  return (
    <div className="flex min-h-dvh">
      <Sidebar username={user.username} role={user.role} collapsed={collapsed} onToggle={toggle} onLogout={logout} loggingOut={loggingOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
            <Link href="/dashboard" aria-label="Payout dashboard" className="lg:hidden"><Logo /></Link>
            <p className="hidden text-sm font-medium text-ink-soft lg:block">
              {navSections.find((section) => section.href === pathname)?.label ?? "Dashboard"}
            </p>
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={logout} loading={loggingOut}>
              {loggingOut ? null : <LogoutIcon className="h-4 w-4" />} Log out
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Dashboard">
            {navSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                aria-current={pathname === section.href ? "page" : undefined}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${
                  pathname === section.href ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink-soft"
                }`}
              >
                <section.icon className="h-3.5 w-3.5" /> {section.label}
              </Link>
            ))}
            <Link href="/shop" className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[13px] text-ink-soft">
              Shop
            </Link>
          </nav>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</div>
        </main>
        <footer className="border-t border-line px-4 py-6 font-mono text-[11px] tracking-wide text-muted-foreground uppercase sm:px-8">
          PayPal · test mode — no real money
        </footer>
      </div>
    </div>
  );
}
