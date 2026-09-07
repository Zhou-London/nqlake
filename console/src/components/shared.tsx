import {
  AlertCircle,
  ArrowUpRight,
  Database,
  Loader2,
  RefreshCw,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Rows } from "@/lib/api";
import { number } from "@/lib/utils";
export function Empty({
  title = "No tables yet",
  text = "Create your first table or import a Parquet file to get started.",
  action,
  search = false,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
  search?: boolean;
}) {
  const Icon = search ? SearchX : Database;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-500">
        <Icon size={25} strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
        {text}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Loading your lakehouse…
    </div>
  );
}
export function ErrorPanel({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 whitespace-pre-wrap break-words">{error}</div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw />
          Retry
        </Button>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-[27px] font-semibold tracking-[-.035em]">
          {title}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}
export function DataGrid({ data }: { data: Rows }) {
  return (
    <>
      <div className="max-h-[480px] overflow-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12">#</th>
              {data.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                <td className="font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                {data.columns.map((c) => (
                  <td
                    key={c}
                    className="max-w-[320px] truncate font-mono text-xs"
                    title={
                      typeof row[c] === "object"
                        ? JSON.stringify(row[c])
                        : String(row[c])
                    }
                  >
                    {row[c] == null ? (
                      <span className="italic text-slate-300">null</span>
                    ) : typeof row[c] === "object" ? (
                      JSON.stringify(row[c])
                    ) : (
                      String(row[c])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && (
          <Empty title="No rows found" text="This request returned no rows." />
        )}
      </div>
      <div className="border-t px-5 py-3 text-[11px] text-muted-foreground">
        {number(data.row_count)} rows returned · {data.columns.length} columns
      </div>
    </>
  );
}
export function exportCSV(data: Rows, name = "query-results") {
  const cell = (v: unknown) =>
    '"' +
    (v == null
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v)
    ).replaceAll('"', '""') +
    '"';
  const csv = [
    data.columns.map(cell).join(","),
    ...data.rows.map((r) => data.columns.map((c) => cell(r[c])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {children}
      <ArrowUpRight size={13} />
    </button>
  );
}
