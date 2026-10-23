type Tone = "amber" | "green" | "blue" | "slate" | "red";

const tones: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  blue: "bg-sky text-brand-600 ring-blue-200 dark:bg-brand/15 dark:text-sky-300 dark:ring-brand/40",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30",
};

const dots: Record<Tone, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-brand",
  slate: "bg-slate-400",
  red: "bg-red-500",
};

export function orderStatus(status: string): { label: string; tone: Tone; payable: boolean } {
  switch (status.toUpperCase()) {
    case "CREATED":
    case "PAYER_ACTION_REQUIRED":
    case "SAVED":
      return { label: "Awaiting payment", tone: "amber", payable: true };
    case "APPROVED":
      return { label: "Approved", tone: "blue", payable: false };
    case "COMPLETED":
      return { label: "Paid", tone: "green", payable: false };
    case "CANCELLED":
    case "CANCELED":
    case "VOIDED":
      return { label: "Cancelled", tone: "slate", payable: false };
    case "FAILED":
      return { label: "Failed", tone: "red", payable: false };
    default:
      return { label: status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: "slate", payable: false };
  }
}

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { label, tone } = orderStatus(status);
  return <Pill tone={tone}>{label}</Pill>;
}
