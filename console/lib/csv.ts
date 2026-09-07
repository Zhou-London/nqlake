import type { Cell } from "./types.ts";
import { cellText } from "./format.ts";

function escape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(columns: string[], rows: Record<string, Cell>[]): string {
  const lines = [columns.map(escape).join(",")];
  for (const row of rows)
    lines.push(columns.map((c) => escape(cellText(row[c]))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function downloadCsv(
  name: string,
  columns: string[],
  rows: Record<string, Cell>[],
) {
  const blob = new Blob([toCsv(columns, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".csv") ? name : `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
