import type { ReactNode } from "react";
import { Dashboard } from "./Dashboard.js";

export default function Layout({ children }: { children: ReactNode }) {
  return <Dashboard>{children}</Dashboard>;
}
