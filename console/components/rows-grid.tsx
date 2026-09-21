"use client";
import { useMemo } from "react";
import {
  Button,
  DataGrid,
  EmptyState,
  type DataGridColumn,
} from "@nowquant/nqui";
import { Download, TerminalSquare } from "lucide-react";
import type { Rows } from "@/lib/api";
import { number } from "@/lib/utils";
import { displayCell, toCsv } from "@/lib/data.mjs";

type Row = Record<string, unknown>;

export function RowsGrid({
  data,
  filename = "query-results",
}: {
  data: Rows;
  filename?: string;
}) {
  const columns = useMemo<DataGridColumn<Row>[]>(
    () =>
      data.columns.map((name) => ({
        id: name,
        accessorFn: (row) => row[name],
        header: name,
        size: 180,
        cell: ({ value }) => (
          <span className={value == null ? "text-subtle" : undefined}>
            {displayCell(value)}
          </span>
        ),
      })),
    [data.columns],
  );
  function download() {
    const csv = toCsv(data.columns, data.rows);
    const url = URL.createObjectURL(
      new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" }),
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
      data={data.rows}
      getRowId={(_, index) => String(index)}
      pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100] }}
      toolbar={{
        title: `${number(data.row_count)} rows · ${data.columns.length} columns`,
        end: (
          <Button
            variant="ghost"
            size="sm"
            startContent={<Download />}
            isDisabled={!data.columns.length}
            onPress={download}
          >
            Export CSV
          </Button>
        ),
      }}
      emptyState={
        <EmptyState
          size="sm"
          icon={<TerminalSquare />}
          title="No matching rows"
          description="The query completed without returning any rows."
        />
      }
    />
  );
}
