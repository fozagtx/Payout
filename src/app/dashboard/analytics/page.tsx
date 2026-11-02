import type { Metadata } from "next";
import { PageHeading } from "../PageHeading.js";
import { AnalyticsStudio } from "./AnalyticsStudio.js";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Your orders at a glance" description="Your orders, refunds, disputes and price alerts." />
      <AnalyticsStudio />
    </section>
  );
}
