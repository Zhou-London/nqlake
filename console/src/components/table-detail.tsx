import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Code2,
  Download,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
import { DataGrid, Empty, ErrorPanel, Loading, exportCSV } from "./shared";
import { FieldError, type Modal } from "./forms";
import {
  api,
  json,
  tablePath,
  errorMessage,
  type LakeTable,
  type Rows,
} from "@/lib/api";
import { cn, date, number } from "@/lib/utils";
const readSchema = z.object({
  filter: z.string(),
  columns: z.string(),
  limit: z.number().int().min(1).max(10000),
});
const metadataSchema = z.object({
  properties: z.string(),
  addColumns: z.string(),
});
export function TableDetail({
  table,
  back,
  query,
  modal,
  refresh,
  revision,
}: {
  table: LakeTable;
  back: () => void;
  query: () => void;
  modal: (m: Modal) => void;
  refresh: () => void;
  revision: number;
}) {
  const [tab, setTab] = useState("Overview"),
    [rows, setRows] = useState<Rows | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useForm<z.infer<typeof readSchema>>({
    resolver: zodResolver(readSchema),
    defaultValues: { filter: "", columns: "", limit: 100 },
  });
  const readRows = async (
    values: z.infer<typeof readSchema>,
    signal?: AbortSignal,
  ) => {
    setBusy(true);
    setError("");
    setRows(null);
    try {
      const params = new URLSearchParams({ limit: String(values.limit) });
      if (values.filter.trim()) params.set("filter", values.filter.trim());
      if (values.columns.trim()) params.set("columns", values.columns.trim());
      const data = await api<Rows>(
        `${tablePath(table.namespace, table.name)}/rows?${params}`,
        { signal },
      );
      if (!signal?.aborted) setRows(data);
    } catch (e) {
      if (!signal?.aborted) setError(errorMessage(e));
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    if (tab === "Data preview")
      void readRows(form.getValues(), controller.signal);
    return () => controller.abort();
  }, [tab, table.namespace, table.name, revision]);
  return (
    <div className="page-enter">
      <button
        className="mb-5 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        onClick={back}
      >
        <ArrowLeft size={14} />
        Back to catalog
      </button>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-primary">
            <Table2 size={25} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {table.namespace}
            </p>
            <h1 className="break-all text-2xl font-semibold tracking-tight">
              {table.name}
            </h1>
          </div>
          <span className="pill">Iceberg v{table.format_version}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => modal({ kind: "rename", table })}
          >
            <Pencil />
            Rename
          </Button>
          <Button onClick={query}>
            <Code2 />
            Query table
          </Button>
        </div>
      </div>
      <div className="mb-6 flex gap-6 overflow-x-auto border-b">
        {["Overview", "Schema", "Data preview", "Settings"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap border-b-2 px-1 pb-3 text-xs font-medium",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
            {t === "Schema" && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {table.columns.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ["Total rows", number(table.row_count)],
              ["Columns", number(table.columns.length)],
              ["Snapshots", number(table.snapshot_count)],
              ["Partitions", number(table.partition_by.length)],
            ].map(([k, v]) => (
              <div className="panel p-5" key={k}>
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  {v}
                </p>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2 className="border-b px-5 py-4 text-sm font-semibold">
              Table information
            </h2>
            <dl className="divide-y px-5">
              {[
                ["Namespace", table.namespace],
                ["Storage location", table.location],
                [
                  "Latest snapshot",
                  table.snapshot_id == null
                    ? "No snapshots yet"
                    : String(table.snapshot_id),
                ],
                ["Last updated", date(table.snapshot_at)],
                [
                  "Partition specification",
                  table.partition_by.join(", ") || "Unpartitioned",
                ],
              ].map(([k, v]) => (
                <div
                  className="grid gap-2 py-4 text-xs sm:grid-cols-[160px_1fr]"
                  key={k}
                >
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-all font-mono text-[11px]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
      {tab === "Schema" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Column definitions</h2>
            <span className="text-xs text-muted-foreground">
              {table.columns.length} columns
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>COLUMN NAME</th>
                  <th>DATA TYPE</th>
                  <th>REQUIRED</th>
                  <th>DESCRIPTION</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((c) => (
                  <tr key={c.id}>
                    <td className="text-muted-foreground">{c.id}</td>
                    <td className="font-medium">{c.name}</td>
                    <td>
                      <span className="pill font-mono">{c.type}</span>
                    </td>
                    <td className="text-muted-foreground">
                      {c.required ? "Required" : "Nullable"}
                    </td>
                    <td className="text-muted-foreground">{c.doc || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "Data preview" && (
        <div className="space-y-4">
          <form
            onSubmit={form.handleSubmit((v) => readRows(v))}
            className="panel flex flex-wrap items-end gap-3 p-4"
          >
            <div className="min-w-44 flex-1">
              <label htmlFor="row-filter">Row filter</label>
              <Input
                id="row-filter"
                placeholder="e.g. price > 10"
                {...form.register("filter")}
              />
            </div>
            <div className="min-w-40 flex-1">
              <label htmlFor="row-columns">Columns</label>
              <Input
                id="row-columns"
                placeholder="All columns"
                {...form.register("columns")}
              />
            </div>
            <div>
              <label htmlFor="row-limit">Limit</label>
              <select
                id="row-limit"
                {...form.register("limit", { valueAsNumber: true })}
              >
                {[100, 500, 1000, 10000].map((n) => (
                  <option key={n} value={n}>
                    {number(n)}
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={busy}>
              <Filter />
              Apply
            </Button>
          </form>
          {error && <ErrorPanel error={error} />}
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <h2 className="text-sm font-semibold">Rows</h2>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => modal({ kind: "append", table })}
                >
                  <Plus />
                  Append
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => modal({ kind: "delete-rows", table })}
                >
                  <Trash2 />
                  Delete rows
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!rows}
                  onClick={() => rows && exportCSV(rows, table.name)}
                >
                  <Download />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label="Refresh rows"
                  onClick={() => void form.handleSubmit((v) => readRows(v))()}
                >
                  <RefreshCw />
                </Button>
              </div>
            </div>
            {busy ? (
              <Loading />
            ) : rows ? (
              <DataGrid data={rows} />
            ) : (
              <Empty
                title="No preview available"
                text="Apply your filters to load rows."
              />
            )}
          </div>
        </div>
      )}
      {tab === "Settings" && (
        <div className="space-y-6">
          <MetadataEditor
            key={JSON.stringify(table.properties) + table.columns.length}
            table={table}
            refresh={refresh}
          />
          <div className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Delete table</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Remove this table from the catalog. Data files are retained in
              storage.
            </p>
            <Button
              className="mt-4"
              variant="destructive"
              onClick={() => modal({ kind: "delete-table", table })}
            >
              <Trash2 />
              Delete table
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
function MetadataEditor({
  table,
  refresh,
}: {
  table: LakeTable;
  refresh: () => void;
}) {
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof metadataSchema>>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      properties: JSON.stringify(table.properties, null, 2),
      addColumns: "[]",
    },
  });
  return (
    <form
      className="panel p-5"
      onSubmit={form.handleSubmit(async (v) => {
        setError("");
        try {
          let properties: unknown, columns: unknown;
          try {
            properties = JSON.parse(v.properties);
            columns = JSON.parse(v.addColumns);
          } catch {
            throw new Error("Properties and columns must be valid JSON.");
          }
          const p = z.record(z.string(), z.string()).safeParse(properties);
          const c = z
            .array(
              z.object({
                name: z.string().min(1),
                type: z.string().min(1),
                required: z.boolean().optional(),
                doc: z.string().optional(),
              }),
            )
            .safeParse(columns);
          if (!p.success)
            throw new Error("Properties must be an object with string values.");
          if (!c.success)
            throw new Error(
              "Columns must be an array of objects with a name and type.",
            );
          await api(
            tablePath(table.namespace, table.name),
            json("PATCH", {
              set_properties: p.data,
              remove_properties: Object.keys(table.properties).filter(
                (k) => !(k in p.data),
              ),
              add_columns: c.data,
            }),
          );
          toast.success("Table settings updated");
          refresh();
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
    >
      <h2 className="mb-5 text-sm font-semibold">Table settings</h2>
      {error && <ErrorPanel error={error} />}
      <label htmlFor="properties">Properties</label>
      <Textarea
        id="properties"
        className="min-h-32 font-mono text-xs"
        {...form.register("properties")}
      />
      <FieldError message={form.formState.errors.properties?.message} />
      <p className="mb-5 mt-2 text-xs text-muted-foreground">
        A JSON object of string values. Remove a key to delete that property.
      </p>
      <label htmlFor="add-columns">Add columns</label>
      <Textarea
        id="add-columns"
        className="font-mono text-xs"
        {...form.register("addColumns")}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Example: {'[{"name":"source","type":"string","required":false}]'}
      </p>
      <div className="mt-5 flex justify-end">
        <Button disabled={form.formState.isSubmitting}>
          <Save />
          {form.formState.isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
