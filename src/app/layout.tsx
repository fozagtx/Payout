import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Payout · Shop from Claude, pay with PayPal", template: "%s · Payout" },
  description:
    "Connect Payout to Claude, ask it to shop, pick products in an interactive canvas right in the chat, and pay with PayPal.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbf9f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col font-sans">{children}</body>
    </html>
  );
}
