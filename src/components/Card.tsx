import type { ReactNode } from "react";

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-[22px] border border-line bg-paper shadow-[0_1px_0_rgba(45,43,40,0.03),0_8px_24px_-12px_rgba(45,43,40,0.08)] ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-cream text-ink">{icon}</div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-soft">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-5 sm:px-6 ${className}`}>{children}</div>;
}
