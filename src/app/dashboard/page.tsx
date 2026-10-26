import type { Metadata } from "next";
import { DashboardHomePage } from "./DashboardPages.js";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <DashboardHomePage />;
}
