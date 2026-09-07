import { TableDetail } from "@/components/table-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ namespace: string; table: string }>;
}) {
  const { namespace, table } = await params;
  return <TableDetail namespace={namespace} name={table} />;
}
