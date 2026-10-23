import type { Metadata } from "next";
import { ButtonLink } from "@/components/Button.js";
import { ChatIcon, XIcon } from "@/components/Icons.js";
import { StatusIcon, StatusLayout } from "@/components/StatusLayout.js";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const order = typeof params.order === "string" ? params.order : null;
  return (
    <StatusLayout>
      <div className="text-center">
        <StatusIcon tone="slate">
          <XIcon className="h-8 w-8" />
        </StatusIcon>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-white">Checkout cancelled</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600 dark:text-slate-400">
          No worries, you weren’t charged. Your picks are still in the chat, so you can change them or check out again any time.
        </p>
        {order ? <p className="mt-3 font-mono text-xs text-slate-400">Order {order}</p> : null}
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <ChatIcon className="h-4 w-4" /> Return to Claude to keep shopping.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </div>
    </StatusLayout>
  );
}
