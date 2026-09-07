"use client";
import Link from "next/link";
import { Table2 } from "lucide-react";
import { type LakeTable, tableHref } from "@/lib/api";
import { date, number } from "@/lib/utils";
import { EmptyState } from "@/components/shared";
export function TableList({
  tables,
  emptyTitle = "No tables yet",
  emptyDescription = "Create a table or import a Parquet file to get started.",
}: {
  tables: LakeTable[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!tables.length)
    return (
      <EmptyState
        icon={Table2}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Table name</th>
            <th>Namespace</th>
            <th className="text-right">Rows</th>
            <th>Format</th>
            <th>Last updated</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={`${table.namespace}.${table.name}`}>
              <td>
                <Link
                  href={tableHref(table.namespace, table.name)}
                  className="flex items-center gap-2.5 font-medium hover:text-primary"
                >
                  <Table2 size={15} className="text-primary" />
                  {table.name}
                </Link>
              </td>
              <td>
                <span className="rounded border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
                  {table.namespace}
                </span>
              </td>
              <td className="text-right font-mono text-[11px]">
                {number(table.row_count)}
              </td>
              <td>
                <span className="text-[11px] text-muted-foreground">
                  Iceberg{" "}
                  <span className="text-[#a1a8b4]">
                    v{table.format_version}
                  </span>
                </span>
              </td>
              <td className="text-[11px] text-muted-foreground">
                {date(table.snapshot_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
