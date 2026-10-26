import { Link } from "./Link.js";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/favicon.svg" alt="" width={32} height={32} className={`${className} rounded-[9px]`} />
  );
}

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
      <LogoMark />
      {compact ? null : <span className="text-[22px] font-semibold tracking-[-0.04em] text-ink">payout</span>}
    </Link>
  );
}
