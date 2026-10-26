"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Button } from "@/components/Button.js";
import { Store } from "lucide-react";
import { BagIcon, HomeIcon, LogoutIcon, PayPalMark, PlugIcon, SidebarIcon, type IconProps } from "@/components/Icons.js";
import { Link } from "@/components/Link.js";
import { Logo, LogoMark } from "@/components/Logo.js";

const STORAGE_KEY = "payout:sidebar-collapsed";

export const sections: { id: string; label: string; icon: ComponentType<IconProps> }[] = [
  { id: "connect", label: "Connect Claude", icon: HomeIcon },
  { id: "orders", label: "Orders", icon: BagIcon },
  { id: "apps", label: "Connected apps", icon: PlugIcon },
  { id: "paypal", label: "PayPal", icon: PayPalMark },
];

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  function toggle() {
    setCollapsed((value) => {
      window.localStorage.setItem(STORAGE_KEY, value ? "0" : "1");
      return !value;
    });
  }
  return { collapsed, toggle };
}

export function Sidebar({
  username,
  collapsed,
  onToggle,
  onLogout,
  loggingOut,
}: {
  username: string;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const item = `flex h-10 items-center gap-3 rounded-xl text-sm text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink ${collapsed ? "justify-center px-0" : "px-3"}`;
  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-cream transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        {collapsed ? (
          <Link href="/" aria-label="Payout home">
            <LogoMark />
          </Link>
        ) : (
          <Logo />
        )}
        {collapsed ? null : (
          <button type="button" onClick={onToggle} aria-label="Collapse sidebar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-ink/5 hover:text-ink">
            <SidebarIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      {collapsed ? (
        <div className="flex justify-center pb-2">
          <button type="button" onClick={onToggle} aria-label="Expand sidebar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-ink/5 hover:text-ink">
            <SidebarIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 px-3 pt-2" aria-label="Dashboard">
        {collapsed ? null : <p className="eyebrow px-3 pb-2">Workspace</p>}
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className={item} title={collapsed ? section.label : undefined}>
            <section.icon className="h-[18px] w-[18px] shrink-0" />
            {collapsed ? <span className="sr-only">{section.label}</span> : section.label}
          </a>
        ))}
        <Link href="/shop" className={item} title={collapsed ? "Shop" : undefined}>
          <Store className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Shop</span> : "Shop"}
        </Link>
      </nav>

      <div className="border-t border-line p-3">
        <div className={`flex items-center gap-3 rounded-xl py-2 ${collapsed ? "justify-center" : "px-2"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tan text-xs font-semibold text-ink uppercase">
            {username.slice(0, 1)}
          </span>
          {collapsed ? null : <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{username}</span>}
        </div>
        {collapsed ? (
          <button type="button" onClick={onLogout} aria-label="Log out" title="Log out" className={`${item} w-full`}>
            <LogoutIcon className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <Button variant="secondary" size="sm" className="mt-1 w-full" onClick={onLogout} loading={loggingOut}>
            {loggingOut ? null : <LogoutIcon className="h-4 w-4" />} Log out
          </Button>
        )}
      </div>
    </aside>
  );
}
