"use client";
import { useMemo, type ReactNode } from "react";
import {
  Button,
  DataGrid,
  EmptyState,
  type DataGridColumn,
} from "@nowquant/nqui";
import { Download, TerminalSquare } from "lucide-react";
import type { Rows } from "@/lib/api";
import { number } from "@/lib/utils";
import { toCsv } from "@/lib/data.mjs";

type Row = Record<string, unknown>;
const NO_ROWS: Row[] = [];

export function RowsGrid({
  data,
  isLoading,
  filename = "query-results",
  emptyState,
}: {
  /** Rows to show. `null` shows the grid's loading rows until the first result arrives. */
  data: Rows | null;
  isLoading?: boolean;
  filename?: string;
  emptyState?: ReactNode;
}) {
  const names = data?.columns;
  const columns = useMemo<DataGridColumn<Row>[]>(
    () =>
      (names ?? []).map((name) => ({
        id: name,
        accessorFn: (row) => row[name],
        header: name,
        size: 180,
      })),
    [names],
  );
  function download() {
    if (!data) return;
    const csv = toCsv(data.columns, data.rows);
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <DataGrid
      aria-label="Result rows"
      bare
      density="compact"
      enableResizing
      columns={columns}
      data={data?.rows ?? NO_ROWS}
      getRowId={(_, index) => String(index)}
      isLoading={isLoading}
      loadingRows={5}
      pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100] }}
      toolbar={{
        title: data
          ? `${number(data.row_count)} rows · ${data.columns.length} columns`
          : undefined,
        end: (
          <Button
            variant="ghost"
            size="sm"
            startContent={<Download />}
            isDisabled={!data?.columns.length}
            onPress={download}
          >
            Export CSV
          </Button>
        ),
      }}
      emptyState={
        emptyState ?? (
          <EmptyState
            size="sm"
            icon={<TerminalSquare />}
            title="No matching rows"
            description="The query completed without returning any rows."
          />
        )
      }
    />
  );
}
