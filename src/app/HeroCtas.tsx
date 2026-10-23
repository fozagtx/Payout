"use client";

import { ButtonLink } from "@/components/Button.js";
import { ArrowRightIcon } from "@/components/Icons.js";
import { useMe } from "@/components/useMe.js";

export function HeroCtas({ onDark = false }: { onDark?: boolean }) {
  const me = useMe();
  if (me.status === "signed-in") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/dashboard" size="lg" variant={onDark ? "paypal" : "primary"}>
          Open dashboard <ArrowRightIcon className="h-4 w-4" />
        </ButtonLink>
        <span className={`text-sm ${onDark ? "text-blue-100/80" : "text-slate-500 dark:text-slate-400"}`}>
          Signed in as <strong className={`font-semibold ${onDark ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>{me.user.username}</strong>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonLink href="/signup" size="lg" variant={onDark ? "paypal" : "primary"}>
        Create free account <ArrowRightIcon className="h-4 w-4" />
      </ButtonLink>
      <ButtonLink href="/login" variant="secondary" size="lg">
        Log in
      </ButtonLink>
    </div>
  );
}
