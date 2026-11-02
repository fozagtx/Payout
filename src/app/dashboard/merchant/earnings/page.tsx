import type { Metadata } from "next";
import { EarningsCard } from "../../EarningsCard.js";
import { PageHeading } from "../../PageHeading.js";

export const metadata: Metadata = { title: "Earnings" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Earnings" description="Your order revenue, plus commission the catalog pays on supplier sales." />
      <EarningsCard />
    </section>
  );
}
