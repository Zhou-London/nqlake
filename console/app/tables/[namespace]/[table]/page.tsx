import type { Metadata } from "next";
import { TableDetail } from "@/components/console/table-detail";

type Params = { params: Promise<{ namespace: string; table: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { namespace, table } = await params;
  return {
    title: `${decodeURIComponent(namespace)}.${decodeURIComponent(table)}`,
  };
}

export default async function TablePage({ params }: Params) {
  const { namespace, table } = await params;
  const ns = decodeURIComponent(namespace);
  const name = decodeURIComponent(table);
  return <TableDetail key={`${ns}.${name}`} namespace={ns} table={name} />;
}
