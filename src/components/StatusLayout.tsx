import type { ReactNode } from "react";
import { Footer, Header } from "./Header.js";

/** Centered single-message page (checkout results, 404). */
export function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header actions={null} />
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-lg animate-rise">{children}</div>
      </main>
      <Footer />
    </>
  );
}

const ring = {
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  red: "bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300",
  slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-sky text-brand dark:bg-brand/15 dark:text-sky-300",
};

export function StatusIcon({ tone, children }: { tone: keyof typeof ring; children: ReactNode }) {
  return <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${ring[tone]}`}>{children}</div>;
}
