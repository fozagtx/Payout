import type { ReactNode } from "react";
import { Footer, Header } from "./Header.js";

/** Centered single-message page (checkout results, 404). */
export function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header actions={null} />
      <main className="bg-dots flex flex-1 items-start justify-center px-4 py-14 sm:py-24">
        <div className="w-full max-w-lg animate-rise">{children}</div>
      </main>
      <Footer />
    </>
  );
}

const ring = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-600 ring-red-200",
  slate: "bg-paper text-ink-soft ring-line-strong",
  blue: "bg-sky text-brand ring-blue-200",
};

export function StatusIcon({ tone, children }: { tone: keyof typeof ring; children: ReactNode }) {
  return <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] ring-1 ${ring[tone]}`}>{children}</div>;
}
