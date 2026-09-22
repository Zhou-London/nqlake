"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Chip,
  DataGrid,
  EmptyState,
  Link,
  type DataGridColumn,
  type DataGridColumnFilter,
  type DataGridProps,
} from "@nowquant/nqui";
import { Table2 } from "lucide-react";
import { type LakeTable, tableHref } from "@/lib/api";

export function TableList({
  tables,
  isLoading,
  emptyTitle = "No tables yet",
  emptyDescription = "Create a table or import a Parquet file to get started.",
  toolbar,
  pagination,
  columnFilters,
  onColumnFiltersChange,
}: {
  tables: LakeTable[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: DataGridProps<LakeTable>["toolbar"];
  pagination?: DataGridProps<LakeTable>["pagination"];
  columnFilters?: DataGridColumnFilter[];
  onColumnFiltersChange?: (filters: DataGridColumnFilter[]) => void;
}) {
  const router = useRouter();
  const columns = useMemo<DataGridColumn<LakeTable>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Table name",
        cell: ({ row }) => (
          <Link
            variant="foreground"
            className="font-medium"
            href={tableHref(row.namespace, row.name)}
          >
            <Table2 className="text-primary-text" />
            {row.name}
          </Link>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
        filter: "select",
        cell: ({ value }) => (
          <Chip size="sm" color="neutral">
            {String(value)}
          </Chip>
        ),
      },
      {
        accessorKey: "row_count",
        header: "Rows",
        format: "integer",
        filter: "number",
      },
      {
        accessorKey: "format_version",
        header: "Format",
        filter: false,
        cell: ({ value }) => `Iceberg v${String(value)}`,
      },
      {
        accessorKey: "snapshot_at",
        header: "Last updated",
        format: "datetime",
        dateOptions: {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
        filter: false,
        sortDescFirst: true,
      },
    ],
    [],
  );
  return (
    <DataGrid
      aria-label="Catalog tables"
      bare
      columns={columns}
      data={tables}
      getRowId={(table) => `${table.namespace}.${table.name}`}
      defaultSorting={[{ id: "snapshot_at", desc: true }]}
      isLoading={isLoading}
      loadingRows={5}
      toolbar={toolbar}
      pagination={pagination}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      onRowAction={(table) =>
        router.push(tableHref(table.namespace, table.name))
      }
      emptyState={
        <EmptyState
          icon={<Table2 />}
          title={emptyTitle}
          description={emptyDescription}
        />
      }
    />
  );
}
