import type { Metadata } from "next";

import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard — AI Lead Conversion",
  description: "Dashboard preview wired to the dummy leads API",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
