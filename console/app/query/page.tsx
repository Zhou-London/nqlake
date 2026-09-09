"use client";
import { Card, Spinner } from "@heroui/react";
import { FormSelect } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  Code2,
  History,
  Loader2,
  Play,
  Search,
  Square,
  Table2,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeading, EmptyState, ErrorBanner } from "@/components/shared";
import { RowsGrid } from "@/components/rows-grid";
import { useLake } from "@/components/lake-provider";
import { api, tableSql, type Rows } from "@/lib/api";
const schema = z.object({
  sql: z.string().trim().min(1, "Enter a SQL query."),
  limit: z.number().int().min(1).max(10000),
});
type HistoryItem = { sql: string; time: string; elapsed: number; rows: number };
export default function Query() {
  const { namespaces, tables, status } = useLake();
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      sql: "-- Start exploring your data here\nSELECT 1 AS ready;",
      limit: 100,
    },
  });
  const sql = form.watch("sql");
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("sql");
    if (initial) form.setValue("sql", initial);
    return () => controller.current?.abort();
  }, [form]);
  async function run(values: z.infer<typeof schema>) {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    setError("");
    setResult(null);
    setElapsed(null);
    const start = performance.now();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await api<Rows>("/query", {
        method: "POST",
        body: JSON.stringify(values),
        signal: abort.signal,
      });
      const duration = Math.round(performance.now() - start);
      setResult(data);
      setElapsed(duration);
      setHistory((items) =>
        [
          {
            sql: values.sql,
            time: new Date().toLocaleTimeString("en-US"),
            elapsed: duration,
            rows: data.row_count,
          },
          ...items,
        ].slice(0, 20),
      );
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "Stopped waiting for results. The server may still be running the query."
          : (err as Error).message,
      );
    } finally {
      setRunning(false);
      lock.current = false;
      controller.current = null;
    }
  }
  return (
    <>
      <PageHeading
        eyebrow=""
        title="SQL workspace"
        description="Explore your lakehouse with SQL and turn data into answers."
      >
        <span className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${status?.services.find((s) => s.name === "duckdb")?.ok ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          DuckDB · Read-only
        </span>
        <Button variant="tertiary" onPress={() => setHistoryOpen(!historyOpen)}>
          <History className="size-3.5" />
          Query history{" "}
          <span className="text-muted-foreground">{history.length}</span>
        </Button>
      </PageHeading>
      <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
        <Card
          render={(props) => <aside {...props} />}
          className="panel self-start"
        >
          <div className="p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-3 z-10 size-3.5 text-muted-foreground" />
              <Input
                aria-label="Search available tables"
                className="pl-8 text-xs"
                placeholder="Find a table…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-96 overflow-auto px-3 pb-4">
            {namespaces.map((ns) => (
              <details key={ns} open className="mb-2">
                <summary className="cursor-pointer py-2 text-xs text-muted-foreground">
                  {ns}
                </summary>
                <div className="ml-1 border-l pl-2">
                  {tables
                    .filter(
                      (t) =>
                        t.namespace === ns &&
                        t.name.toLowerCase().includes(term.toLowerCase()),
                    )
                    .map((t) => (
                      <button
                        key={t.name}
                        disabled={running}
                        onClick={() =>
                          form.setValue("sql", tableSql(ns, t.name))
                        }
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent-soft hover:text-primary"
                      >
                        <Table2 size={13} />
                        <span className="truncate">{t.name}</span>
                      </button>
                    ))}
                </div>
              </details>
            ))}
            {!namespaces.length && (
              <p className="px-2 py-6 text-center text-[11px] leading-6 text-muted-foreground">
                Connect to the data service
                <br />
                to choose a table here.
              </p>
            )}
          </div>
        </Card>
        <div className="min-w-0 space-y-5">
          <form
            onSubmit={form.handleSubmit(run)}
            className="panel overflow-hidden"
          >
            <div className="flex h-11 items-center justify-between border-b bg-[#fafbfc] px-4">
              <span className="flex items-center gap-2 text-xs">
                <Code2 size={14} className="text-primary" />
                Untitled query{" "}
                <span className="ml-2 size-1.5 rounded-full bg-blue-400" />
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                SQL
              </span>
            </div>
            <div className="flex min-h-64 py-5">
              <div
                aria-hidden="true"
                className="w-12 shrink-0 select-none text-right font-mono text-xs leading-7 text-[#b9c1ce]"
              >
                {sql.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                aria-label="SQL editor"
                spellCheck={false}
                className="min-h-56 w-full resize-y bg-transparent px-5 font-mono text-[13px] leading-7 text-[#315181] outline-none focus-visible:outline-none"
                {...form.register("sql")}
                disabled={running}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void form.handleSubmit(run)();
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart;
                    form.setValue(
                      "sql",
                      sql.slice(0, start) + "  " + sql.slice(el.selectionEnd),
                    );
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 2;
                    });
                  }
                }}
              />
            </div>
            {form.formState.errors.sql && (
              <p className="field-error px-5 pb-3">
                {form.formState.errors.sql.message}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
              <Button type="submit" isDisabled={running}>
                {running ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {running ? "Running…" : "Run query"}
              </Button>
              {running && (
                <Button
                  type="button"
                  variant="tertiary"
                  onPress={() => controller.current?.abort()}
                >
                  <Square className="size-3" />
                  Stop waiting
                </Button>
              )}
              <kbd className="hidden text-[10px] text-muted-foreground sm:block">
                ⌘ / Ctrl ↵
              </kbd>
              <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                Row limit
                <FormSelect
                  control={form.control}
                  name="limit"
                  label="Row limit"
                  valueAsNumber
                  isDisabled={running}
                  options={[100, 500, 1000, 10000].map((n) => ({
                    value: String(n),
                    label: `${n} rows`,
                  }))}
                />
              </div>
            </div>
          </form>
          {error && <ErrorBanner message={error} />}
          <Card
            render={(props) => <section {...props} />}
            className="panel overflow-hidden"
          >
            <div className="panel-title">
              <h2 className="text-xs font-medium">Results</h2>
              {elapsed != null && (
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Check size={13} className="text-emerald-500" />
                  Completed<span className="mx-1">·</span>
                  {elapsed} ms (including network)
                </span>
              )}
            </div>
            {running ? (
              <div
                role="status"
                className="flex min-h-52 flex-col items-center justify-center gap-3 text-xs text-muted-foreground"
              >
                <Spinner size="md" aria-label="Running query" />
                Running query…
              </div>
            ) : result ? (
              <RowsGrid data={result} />
            ) : (
              <EmptyState
                icon={TerminalSquare}
                title="Your results appear here"
                description="Write SQL or select a table, then run your query."
              />
            )}
          </Card>
          {historyOpen && (
            <Card render={(props) => <section {...props} />} className="panel">
              <div className="panel-title">
                <h2 className="text-xs font-medium">Session query history</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={!history.length}
                  onPress={() => setHistory([])}
                >
                  Clear history
                </Button>
              </div>
              {!history.length ? (
                <p className="p-8 text-center text-xs text-muted-foreground">
                  Successful queries appear here. History clears when you leave
                  this page.
                </p>
              ) : (
                history.map((item, i) => (
                  <button
                    disabled={running}
                    key={i}
                    onClick={() => form.setValue("sql", item.sql)}
                    className="flex w-full items-center justify-between gap-4 border-t p-4 text-left hover:bg-surface-secondary"
                  >
                    <code className="truncate text-xs">{item.sql}</code>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.time} · {item.rows} rows
                    </span>
                  </button>
                ))
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
