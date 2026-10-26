import type { Metadata } from "next";
import { DashboardAppsPage } from "../DashboardPages.js";
import { PageHeading } from "../PageHeading.js";

export const metadata: Metadata = { title: "Connected apps" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Connected apps" description="Review and disconnect AI apps that can access your Payout account." />
      <DashboardAppsPage />
    </section>
  );
}
