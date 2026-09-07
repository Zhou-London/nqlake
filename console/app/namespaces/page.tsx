import type { Metadata } from "next";
import { NamespaceList } from "@/components/console/namespace-list";

export const metadata: Metadata = { title: "Namespaces" };

export default function NamespacesPage() {
  return <NamespaceList />;
}
