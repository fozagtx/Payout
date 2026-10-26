import type { Metadata } from "next";
import { AlertsCard } from "../AlertsCard.js";
import { PageHeading } from "../PageHeading.js";

export const metadata: Metadata = { title: "Price alerts" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Price alerts" description="Track price drops and back-in-stock updates for products you care about." />
      <AlertsCard />
    </section>
  );
}
