import type { Metadata } from "next";
import { PageHeading } from "../../PageHeading.js";
import { AnalyticsStudio } from "./AnalyticsStudio.js";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Analytics" description="Revenue, refunds, disputes and commission from your real orders." />
      <AnalyticsStudio />
    </section>
  );
}
