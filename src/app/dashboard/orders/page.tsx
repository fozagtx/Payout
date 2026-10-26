import type { Metadata } from "next";
import { OrdersCard } from "../OrdersCard.js";
import { PageHeading } from "../PageHeading.js";

export const metadata: Metadata = { title: "Orders" };

export default function Page() {
  return (
    <section>
      <PageHeading title="Orders" description="Your PayPal checkouts, payment status and dispute updates." />
      <OrdersCard />
    </section>
  );
}
