import type { Metadata } from "next";
import { ButtonLink } from "@/components/Button.js";
import { StatusLayout } from "@/components/StatusLayout.js";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusLayout>
      <div className="text-center">
        <p className="font-mono text-sm tracking-[0.2em] text-tan-ink">ERROR 404</p>
        <h1 className="mt-3 text-[32px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink sm:text-[40px]">This page wandered off</h1>
        <p className="mt-2 text-ink-soft">The link may be old or mistyped.</p>
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
