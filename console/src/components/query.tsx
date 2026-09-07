import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  Loader2,
  Play,
  Table2,
} from "lucide-react";
import { Button } from "./ui/button";
import { PageHeading, DataGrid, Empty, ErrorPanel, exportCSV } from "./shared";
import { FieldError } from "./forms";
import { api, json, errorMessage, type Rows, type LakeTable } from "@/lib/api";
const schema = z.object({
  sql: z.string().trim().min(1, "Enter a SQL query."),
  limit: z.number().int().min(1).max(10000),
});
export const tableSQL = (t: Pick<LakeTable, "namespace" | "name">) =>
  "SELECT *\nFROM lake." +
  [...t.namespace.split("."), t.name]
    .map((s) => '"' + s.replaceAll('"', '""') + '"')
    .join(".") +
  "\nLIMIT 100;";
export function QueryPage({
  tables,
  initialSQL,
}: {
  tables: LakeTable[];
  initialSQL: string;
}) {
  const [result, setResult] = useState<Rows | null>(null),
    [error, setError] = useState(""),
    [duration, setDuration] = useState(0),
    [history, setHistory] = useState<string[]>([]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { sql: initialSQL || "SELECT 1 AS ready;", limit: 100 },
  });
  const submit = form.handleSubmit(async (values) => {
    setError("");
    setResult(null);
    const start = performance.now();
    try {
      const data = await api<Rows>("/query", json("POST", values));
      setResult(data);
      setDuration(performance.now() - start);
      setHistory((h) =>
        [values.sql, ...h.filter((s) => s !== values.sql)].slice(0, 10),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const busy = form.formState.isSubmitting;
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Workspace / Query"
        title="SQL editor"
        description="A direct line to your data. Query your lakehouse with DuckDB."
      />
      <div className="grid gap-5 xl:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="panel self-start">
          <div className="border-b px-4 py-3.5 text-xs font-semibold">
            Table explorer{" "}
            <span className="ml-2 text-muted-foreground">{tables.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {tables.length ? (
              tables.map((t) => (
                <button
                  key={`${t.namespace}.${t.name}`}
                  onClick={() => form.setValue("sql", tableSQL(t))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-xs hover:bg-accent"
                >
                  <Table2 className="size-3.5 shrink-0 text-blue-500" />
                  <span className="truncate">
                    <span className="text-muted-foreground">
                      {t.namespace}.
                    </span>
                    {t.name}
                  </span>
                  <ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-xs leading-5 text-muted-foreground">
                Create a table to explore its data here.
              </p>
            )}
          </div>
          {history.length > 0 && (
            <>
              <div className="border-y px-4 py-3 text-xs font-semibold">
                Session history
              </div>
              <div className="p-2">
                {history.map((sql, i) => (
                  <button
                    key={i}
                    onClick={() => form.setValue("sql", sql)}
                    className="flex w-full gap-2 rounded-md p-2 text-left text-xs hover:bg-accent"
                  >
                    <Clock3 className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{sql}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <div className="min-w-0 space-y-5">
          <form onSubmit={submit} className="panel">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Code2 className="size-4 text-primary" />
                Untitled query
                <span className="ml-2 size-1.5 rounded-full bg-blue-500" />
              </div>
              <span className="pill">DuckDB SQL</span>
            </div>
            <div className="flex min-h-64 bg-[#fbfcff] py-5">
              <div
                aria-hidden="true"
                className="w-12 shrink-0 select-none text-right font-mono text-[13px] leading-7 text-slate-300"
              >
                {form
                  .watch("sql")
                  .split("\n")
                  .map((_, i) => (
                    <div key={i} className="pr-4">
                      {i + 1}
                    </div>
                  ))}
              </div>
              <textarea
                aria-label="SQL query"
                spellCheck={false}
                className="min-h-56 flex-1 resize-y bg-transparent pr-5 font-mono text-[13px] leading-7 text-[#305ab0] outline-none"
                {...form.register("sql")}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (!busy) void submit();
                  }
                }}
              />
            </div>
            <div className="px-5">
              <FieldError message={form.formState.errors.sql?.message} />
              <FieldError message={form.formState.errors.limit?.message} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
              <span className="text-[11px] text-muted-foreground">
                Read-only queries <span className="mx-2">·</span> ⌘ / Ctrl +
                Enter to run
              </span>
              <div className="flex items-center gap-3">
                <select
                  aria-label="Query result limit"
                  {...form.register("limit", { valueAsNumber: true })}
                >
                  {[100, 500, 1000, 10000].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()} row limit
                    </option>
                  ))}
                </select>
                <Button disabled={busy}>
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Play className="fill-current" />
                  )}
                  {busy ? "Running…" : "Run query"}
                </Button>
              </div>
            </div>
          </form>
          {error && <ErrorPanel error={error} />}
          <div className="panel">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-3 text-xs font-semibold">
                Results
                {result && (
                  <span className="flex items-center gap-1 font-normal text-emerald-600">
                    <Check size={13} />
                    {(duration / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!result}
                onClick={() => result && exportCSV(result)}
              >
                <Download />
                Export CSV
              </Button>
            </div>
            {result ? (
              <DataGrid data={result} />
            ) : (
              <Empty
                title={
                  busy ? "Running your query" : "Your results will appear here"
                }
                text={
                  busy
                    ? "DuckDB is reading your lakehouse."
                    : "Write a SQL statement and click Run query to explore your data."
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
