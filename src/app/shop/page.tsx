import type { Metadata } from "next";
import { Shop } from "./Shop.js";

export const metadata: Metadata = { title: "Shop" };

export default function Page() {
  return <Shop />;
}
