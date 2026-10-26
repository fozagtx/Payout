type Tone = "amber" | "green" | "blue" | "slate" | "red";

const tones: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200/80",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
  blue: "bg-sky text-brand-600 ring-blue-200/80",
  slate: "bg-cream text-ink-soft ring-line-strong",
  red: "bg-red-50 text-red-700 ring-red-200/80",
};

const dots: Record<Tone, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-brand",
  slate: "bg-muted-foreground",
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
    case "PARTIALLY_REFUNDED":
      return { label: "Partially refunded", tone: "amber", payable: false };
    case "REFUNDED":
      return { label: "Refunded", tone: "slate", payable: false };
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wide ring-1 ring-inset ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { label, tone } = orderStatus(status);
  return <Pill tone={tone}>{label}</Pill>;
}
