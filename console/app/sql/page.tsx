import type { Metadata } from "next";
import { SqlWorkspace } from "@/components/console/sql-workspace";

export const metadata: Metadata = { title: "SQL" };

export default function SqlPage() {
  return <SqlWorkspace />;
}
