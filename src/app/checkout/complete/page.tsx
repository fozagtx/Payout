import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusLayout } from "@/components/StatusLayout.js";
import { Spinner } from "@/components/Icons.js";
import { CheckoutComplete } from "./CheckoutComplete.js";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function Page() {
  return (
    <StatusLayout>
      <Suspense
        fallback={
          <div className="flex justify-center py-20 text-slate-400">
            <Spinner className="h-6 w-6" />
          </div>
        }
      >
        <CheckoutComplete />
      </Suspense>
    </StatusLayout>
  );
}
