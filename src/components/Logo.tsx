import { Link } from "./Link.js";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/favicon.svg" alt="" width={32} height={32} className={`${className} rounded-lg shadow-sm`} />
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight text-navy dark:text-white">
        Pay<span className="text-brand">out</span>
      </span>
    </Link>
  );
}
