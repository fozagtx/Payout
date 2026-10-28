import type { Metadata } from "next";
import { EarningsCard } from "../../EarningsCard.js";
import { PageHeading } from "../../PageHeading.js";

export const metadata: Metadata = { title: "Earnings" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Earnings" description="Channel3 clicks, sales and commissions from your store links." />
      <EarningsCard />
    </section>
  );
}
