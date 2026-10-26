import { Link } from "./Link.js";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "./Icons.js";

type Variant = "primary" | "paypal" | "secondary" | "ghost" | "danger" | "blue";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(28,27,25,0.25)] hover:bg-ink-900",
  blue: "bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(47,107,211,0.35)] hover:bg-brand-600",
  paypal: "bg-paypal text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_2px_rgba(0,48,135,0.15)] hover:bg-paypal-600 font-semibold",
  secondary: "bg-paper text-ink ring-1 ring-inset ring-line-strong hover:bg-cream",
  ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
  danger: "bg-paper text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "inline-flex items-center justify-center font-medium tracking-[-0.01em] whitespace-nowrap transition select-none active:translate-y-px",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    "disabled:pointer-events-none disabled:opacity-60",
    variants[variant],
    sizes[size],
    extra,
  ].join(" ");
}

type Common = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function Button({
  variant,
  size,
  className,
  loading,
  children,
  disabled,
  type = "button",
  ...rest
}: Common & { loading?: boolean } & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** Internal Next.js link styled as a button. */
export function ButtonLink({ href, variant, size, className, children }: Common & { href: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/** Plain anchor (full page load / external) styled as a button. */
export function ButtonAnchor({
  variant,
  size,
  className,
  children,
  ...rest
}: Common & Omit<ComponentProps<"a">, "className" | "children">) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
