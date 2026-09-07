import type { Metadata } from "next";
import { ImportForm } from "@/components/console/import-form";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <ImportForm />;
}
