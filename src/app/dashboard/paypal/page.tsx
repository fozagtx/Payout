import type { Metadata } from "next";
import { DashboardPayPalPage } from "../DashboardPages.js";
import { PageHeading } from "../PageHeading.js";

export const metadata: Metadata = { title: "PayPal" };

export default function Page() {
  return (
    <section>
      <PageHeading title="PayPal" description="Link your sandbox buyer account for faster test checkouts." />
      <DashboardPayPalPage />
    </section>
  );
}
