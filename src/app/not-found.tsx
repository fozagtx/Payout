import type { Metadata } from "next";
import { ButtonLink } from "@/components/Button.js";
import { StatusLayout } from "@/components/StatusLayout.js";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusLayout>
      <div className="text-center">
        <p className="text-6xl font-black tracking-tight text-brand/20 dark:text-brand/30">404</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-white">This page wandered off</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">The link may be old or mistyped.</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/">Back home</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Dashboard
          </ButtonLink>
        </div>
      </div>
    </StatusLayout>
  );
}
