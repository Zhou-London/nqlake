import { TableBrowser } from "@/components/console/table-browser";

export default function TablesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TableBrowser>{children}</TableBrowser>;
}
