import { Link } from "./Link.js";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "./Icons.js";

type Variant = "primary" | "paypal" | "secondary" | "ghost" | "danger" | "navy";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-600 active:bg-navy",
  navy: "bg-navy text-white shadow-sm hover:bg-navy-900",
  paypal: "bg-paypal text-navy shadow-sm hover:bg-paypal-600 font-bold",
  secondary:
    "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:
    "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 dark:bg-transparent dark:text-red-400 dark:ring-red-900 dark:hover:bg-red-950/50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
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
