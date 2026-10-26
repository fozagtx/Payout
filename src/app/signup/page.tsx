import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm, AuthFormFallback } from "@/components/AuthForm.js";
import { Header } from "@/components/Header.js";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <>
      <Header actions={null} />
      <main className="bg-dots flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <Suspense fallback={<AuthFormFallback />}>
          <AuthForm mode="signup" />
        </Suspense>
      </main>
    </>
  );
}
