"use client";

import { ButtonLink } from "@/components/Button.js";
import { ArrowRightIcon } from "@/components/Icons.js";
import { useMe } from "@/components/useMe.js";

export function HeroCtas({ center = false }: { center?: boolean }) {
  const me = useMe();
  const wrap = `flex flex-wrap items-center gap-3 ${center ? "justify-center" : ""}`;
  if (me.status === "signed-in") {
    return (
      <div className={wrap}>
        <ButtonLink href="/dashboard" size="lg">
          Go to dashboard <ArrowRightIcon className="h-4 w-4" />
        </ButtonLink>
        <span className="text-sm text-ink-soft">
          Signed in as <strong className="font-semibold text-ink">{me.user.username}</strong>
        </span>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <ButtonLink href="/signup" size="lg">
        Create free account
      </ButtonLink>
      <ButtonLink href="/signup" variant="blue" size="lg">
        Connect Claude <ArrowRightIcon className="h-4 w-4" />
      </ButtonLink>
    </div>
  );
}
