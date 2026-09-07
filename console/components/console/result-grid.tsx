"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv";
import { cellText, formatCount } from "@/lib/format";
import type { Rows } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE = 50;

/**
 * Renders a RowsOut answer: a scrollable grid, 50 rows a page, and a CSV
 * export of every returned row. Numbers align right and keep their digits.
 */
export function ResultGrid({
  result,
  exportName,
  className,
}: {
  result: Rows;
  exportName: string;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE));
  useEffect(() => setPage(0), [result]);

  const numeric = useMemo(() => {
    const set = new Set<string>();
    for (const column of result.columns) {
      const sample = result.rows.find(
        (r) => r[column] !== null && r[column] !== undefined,
      );
      if (sample && typeof sample[column] === "number") set.add(column);
    }
    return set;
  }, [result]);

  const slice = result.rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="tabular">
          {formatCount(result.row_count)} row{result.row_count === 1 ? "" : "s"}{" "}
          · {result.columns.length} column
          {result.columns.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {pages > 1 && (
            <>
              <span className="tabular">
                {page * PAGE + 1}–
                {Math.min(result.rows.length, (page + 1) * PAGE)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="xs"
            disabled={result.rows.length === 0}
            onClick={() => downloadCsv(exportName, result.columns, result.rows)}
          >
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="w-max min-w-full font-mono text-xs">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-10 text-right text-muted-foreground tabular">
                #
              </TableHead>
              {result.columns.map((column) => (
                <TableHead
                  key={column}
                  className={cn(
                    "font-sans font-medium",
                    numeric.has(column) && "text-right",
                  )}
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={result.columns.length + 1}
                  className="h-24 text-center font-sans text-muted-foreground"
                >
                  No rows.
                </TableCell>
              </TableRow>
            ) : (
              slice.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-right text-muted-foreground tabular">
                    {page * PAGE + i + 1}
                  </TableCell>
                  {result.columns.map((column) => {
                    const value = row[column];
                    const isNull = value === null || value === undefined;
                    return (
                      <TableCell
                        key={column}
                        className={cn(
                          "max-w-96 truncate tabular",
                          numeric.has(column) && "text-right",
                          isNull && "text-muted-foreground/60 italic",
                        )}
                        title={isNull ? undefined : cellText(value)}
                      >
                        {isNull ? "null" : cellText(value)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
