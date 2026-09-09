"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Rows } from "@/lib/api";
import { number } from "@/lib/utils";
import { displayCell, toCsv } from "@/lib/data.mjs";
export const cell = displayCell;
export function RowsGrid({
  data,
  filename = "query-results",
}: {
  data: Rows;
  filename?: string;
}) {
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, Math.ceil(data.rows.length / 25) - 1);
  useEffect(() => {
    setPage(0);
  }, [data]);
  function download() {
    const csv = toCsv(data.columns, data.rows);
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <span className="text-xs text-muted-foreground">
          {number(data.row_count)} rows · {data.columns.length} columns
        </span>
        <Button
          variant="ghost"
          size="sm"
          onPress={download}
          isDisabled={!data.columns.length}
        >
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="data-table" aria-label="Query result rows">
          <thead className="sticky top-0">
            <tr>
              <th className="w-12">#</th>
              {data.columns.map((c) => (
                <th key={c} className="font-mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(page * 25, page * 25 + 25).map((row, i) => (
              <tr key={i}>
                <td className="text-muted-foreground">{page * 25 + i + 1}</td>
                {data.columns.map((c) => (
                  <td
                    key={c}
                    className={`max-w-80 truncate font-mono text-[11px] ${row[c] == null ? "text-muted-foreground" : ""}`}
                    title={cell(row[c])}
                  >
                    {cell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && (
          <p className="py-14 text-center text-xs text-muted-foreground">
            Query completed. No matching rows.
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 border-t px-5 py-3 text-[11px] text-muted-foreground">
        <span>
          Page {page + 1} of {maxPage + 1}
        </span>
        <Button
          variant="tertiary"
          size="sm"
          isDisabled={page === 0}
          onPress={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          isDisabled={page >= maxPage}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
