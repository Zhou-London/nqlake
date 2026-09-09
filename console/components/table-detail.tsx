"use client";
import { Card, TextArea } from "@heroui/react";
import { FormSelect, SelectField } from "@/components/ui/select";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@heroui/styles";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Filter, Plus, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeading,
  ErrorBanner,
  LoadingState,
  RefreshButton,
} from "@/components/shared";
import { RowsGrid } from "@/components/rows-grid";
import { useLake } from "@/components/lake-provider";
import {
  api,
  tablePath,
  tableHref,
  tableSql,
  type LakeTable,
  type Rows,
} from "@/lib/api";
import { date, number } from "@/lib/utils";

const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Enter a valid table name."),
});
const rowsSchema = z.object({
  json: z.string().refine((value) => {
    try {
      const rows = JSON.parse(value);
      return (
        Array.isArray(rows) &&
        rows.length > 0 &&
        rows.every(
          (row) =>
            row !== null && typeof row === "object" && !Array.isArray(row),
        )
      );
    } catch {
      return false;
    }
  }, "Enter a JSON array containing at least one object."),
});
const columnSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Enter a valid column name."),
  type: z.string().min(1),
});
export function TableDetail({
  namespace,
  name,
}: {
  namespace: string;
  name: string;
}) {
  const router = useRouter();
  const { refresh } = useLake();
  const path = tablePath(namespace, name);
  const [table, setTable] = useState<LakeTable | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [rowsError, setRowsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(100);
  const [dialog, setDialog] = useState<
    "rename" | "append" | "drop" | "column" | "deleteRows" | null
  >(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteFilter, setDeleteFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const rename = useForm<z.infer<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name },
  });
  const append = useForm<z.infer<typeof rowsSchema>>({
    resolver: zodResolver(rowsSchema),
    defaultValues: { json: '[\n  {"id": 1}\n]' },
  });
  const column = useForm<z.infer<typeof columnSchema>>({
    resolver: zodResolver(columnSchema),
    defaultValues: { name: "", type: "string" },
  });
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setTable(await api<LakeTable>(path, { signal }));
      } catch (err) {
        if (!signal?.aborted) setError((err as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    setRowsLoading(true);
    setRowsError("");
    setRows(null);
    api<Rows>(`${path}/rows?limit=100`, { signal: controller.signal })
      .then(setRows)
      .catch((err) => {
        if (!controller.signal.aborted) setRowsError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRowsLoading(false);
      });
    return () => controller.abort();
  }, [path]);
  async function loadRows() {
    setRowsLoading(true);
    setRowsError("");
    setRows(null);
    try {
      setRows(
        await api<Rows>(
          `${path}/rows?${new URLSearchParams({ limit: String(limit), ...(filter.trim() ? { filter: filter.trim() } : {}) })}`,
        ),
      );
    } catch (err) {
      setRowsError((err as Error).message);
    } finally {
      setRowsLoading(false);
    }
  }
  function open(value: typeof dialog) {
    setActionError("");
    setConfirmation("");
    setDeleteFilter("");
    rename.reset({ name });
    column.reset();
    setDialog(value);
  }
  async function mutate(
    body: unknown,
    method = "PATCH",
    suffix = "",
    rawBody?: string,
  ) {
    setBusy(true);
    setActionError("");
    try {
      const result = await api<LakeTable | { rows: number }>(path + suffix, {
        method,
        ...(rawBody
          ? { body: rawBody }
          : body
            ? { body: JSON.stringify(body) }
            : {}),
      });
      toast.success("Changes saved.");
      setDialog(null);
      if (method === "DELETE" && !suffix) {
        await refresh();
        router.push("/catalog");
      } else if (result && "name" in result && result.name !== name) {
        await refresh();
        router.replace(tableHref(result.namespace, result.name));
      } else {
        await Promise.all([load(), loadRows(), refresh()]);
      }
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href="/catalog"
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={13} />
        Back to catalog
      </Link>
      <PageHeading
        eyebrow={namespace}
        title={name}
        description="Explore the schema, preview rows, and manage your Iceberg table."
      >
        <RefreshButton
          loading={loading || rowsLoading}
          onClick={() => {
            void load();
            void loadRows();
          }}
        />

        <Link
          className={buttonVariants({
            variant: "primary",
            className: "gap-2 text-xs",
          })}
          href={`/query?sql=${encodeURIComponent(tableSql(namespace, name))}`}
        >
          <TerminalSquare className="size-3.5" />
          Query table
        </Link>
      </PageHeading>
      {error && <ErrorBanner message={error} onRetry={() => load()} />}
      {loading && !table ? (
        <LoadingState />
      ) : (
        table && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Total rows", value: number(table.row_count) },
                { label: "Columns", value: table.columns.length },
                { label: "Snapshots", value: table.snapshot_count },
                {
                  label: "Table format",
                  value: `Iceberg v${table.format_version}`,
                },
              ].map((item) => (
                <Card key={item.label} className="panel p-5">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-3 text-xl font-medium">{item.value}</p>
                </Card>
              ))}
            </div>
            <Tabs defaultSelectedKey="data">
              <TabsList aria-label="Table details" className="mb-5">
                <TabsTrigger id="data">Data preview</TabsTrigger>
                <TabsTrigger id="schema">
                  Schema
                  <span className="text-[10px]">{table.columns.length}</span>
                </TabsTrigger>
                <TabsTrigger id="metadata">Metadata</TabsTrigger>
                <TabsTrigger id="manage">Manage</TabsTrigger>
              </TabsList>
              <TabsContent id="data">
                <Card
                  render={(props) => <section {...props} />}
                  className="panel overflow-hidden"
                >
                  <form
                    className="flex flex-wrap items-center gap-3 border-b p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadRows();
                    }}
                  >
                    <Filter size={15} className="text-muted-foreground" />
                    <Input
                      aria-label="Iceberg row filter"
                      className="min-w-44 flex-1 font-mono text-xs"
                      placeholder="Filter, e.g. price > 10 AND side = 'A'"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    <SelectField
                      label="Preview limit"
                      value={String(limit)}
                      onChange={(value) => setLimit(Number(value))}
                      options={[100, 500, 1000].map((n) => ({
                        value: String(n),
                        label: `${n} rows`,
                      }))}
                    />
                    <Button
                      variant="tertiary"
                      isDisabled={rowsLoading}
                      type="submit"
                    >
                      Apply filter
                    </Button>
                  </form>
                  {rowsError && (
                    <div className="p-4">
                      <ErrorBanner message={rowsError} onRetry={loadRows} />
                    </div>
                  )}
                  {rowsLoading ? (
                    <LoadingState />
                  ) : (
                    rows && (
                      <RowsGrid data={rows} filename={`${namespace}.${name}`} />
                    )
                  )}
                </Card>
              </TabsContent>
              <TabsContent id="schema">
                <Card
                  render={(props) => <section {...props} />}
                  className="panel overflow-hidden"
                >
                  <div className="panel-title">
                    <h2 className="text-xs font-medium">Columns</h2>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onPress={() => open("column")}
                    >
                      <Plus className="size-3" />
                      Add column
                    </Button>
                  </div>
                  <div className="overflow-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Column name</th>
                          <th>Type</th>
                          <th>Nullable</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((c) => (
                          <tr key={c.id}>
                            <td className="text-muted-foreground">{c.id}</td>
                            <td className="font-mono">{c.name}</td>
                            <td className="font-mono text-primary">{c.type}</td>
                            <td>{c.required ? "No" : "Yes"}</td>
                            <td className="text-muted-foreground">
                              {c.doc || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>
              <TabsContent id="metadata">
                <Card
                  render={(props) => <section {...props} />}
                  className="panel p-5"
                >
                  <h2 className="mb-5 text-sm font-medium">Table metadata</h2>
                  <dl className="space-y-4">
                    {[
                      { key: "Namespace", value: namespace },
                      { key: "Storage location", value: table.location },
                      {
                        key: "Current snapshot ID",
                        value: table.snapshot_id ?? "No snapshots",
                      },
                      { key: "Snapshot time", value: date(table.snapshot_at) },
                      {
                        key: "Partitioning",
                        value: table.partition_by.join(", ") || "Unpartitioned",
                      },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="grid gap-2 border-b pb-4 sm:grid-cols-[140px_1fr]"
                      >
                        <dt className="text-xs text-muted-foreground">
                          {item.key}
                        </dt>
                        <dd className="break-all font-mono text-xs">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <h3 className="mb-3 mt-6 text-xs font-medium">
                    Table properties
                  </h3>
                  <div className="overflow-auto rounded-md border bg-surface-secondary/40 p-4">
                    <pre className="font-mono text-xs leading-6">
                      {JSON.stringify(table.properties, null, 2)}
                    </pre>
                  </div>
                </Card>
              </TabsContent>
              <TabsContent id="manage">
                <Card
                  render={(props) => <section {...props} />}
                  className="panel divide-y"
                >
                  {[
                    {
                      title: "Rename table",
                      description:
                        "Change the catalog name. Update existing queries to use the new name.",
                      action: "Rename",
                      kind: "rename" as const,
                    },
                    {
                      title: "Append JSON rows",
                      description:
                        "Append a JSON array of rows matching the table schema.",
                      action: "Append data",
                      kind: "append" as const,
                    },
                    {
                      title: "Delete rows by filter",
                      description:
                        "Remove rows matching an Iceberg filter expression.",
                      action: "Delete rows",
                      kind: "deleteRows" as const,
                    },
                    {
                      title: "Remove table from catalog",
                      description:
                        "Remove the catalog entry and keep storage files. Confirm the table name to proceed.",
                      action: "Remove table",
                      kind: "drop" as const,
                    },
                  ].map((item) => (
                    <div
                      key={item.kind}
                      className="flex flex-wrap items-center justify-between gap-4 p-5"
                    >
                      <div>
                        <h3 className="text-sm font-medium">{item.title}</h3>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <Button
                        variant={
                          item.kind === "drop" || item.kind === "deleteRows"
                            ? "danger"
                            : "tertiary"
                        }
                        onPress={() => open(item.kind)}
                      >
                        {item.action}
                      </Button>
                    </div>
                  ))}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )
      )}
      <Dialog
        isOpen={!!dialog}
        onOpenChange={(value) => {
          if (!value && !busy) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {dialog === "rename"
              ? "Rename table"
              : dialog === "append"
                ? "Append JSON rows"
                : dialog === "column"
                  ? "Add column"
                  : dialog === "deleteRows"
                    ? "Delete matching rows"
                    : "Remove table"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "drop"
              ? `This removes ${namespace}.${name} from the catalog and keeps its storage files.`
              : dialog === "deleteRows"
                ? "Rows matching the filter will be deleted. A filter of true deletes all rows."
                : "Changes apply directly to this table."}
          </DialogDescription>
          {actionError && <ErrorBanner message={actionError} />}
          {dialog === "rename" && (
            <form
              className="space-y-4"
              onSubmit={rename.handleSubmit((value) =>
                mutate({ rename_to: value.name }),
              )}
            >
              <label className="field-label" htmlFor="rename-name">
                New table name
              </label>
              <Input id="rename-name" {...rename.register("name")} />
              <p className="field-error">
                {rename.formState.errors.name?.message}
              </p>
              <Button type="submit" isDisabled={busy} className="w-full">
                {busy ? "Saving…" : "Save name"}
              </Button>
            </form>
          )}
          {dialog === "append" && (
            <form
              className="space-y-4"
              onSubmit={append.handleSubmit((value) =>
                mutate(null, "POST", "/rows", `{"rows":${value.json}}`),
              )}
            >
              <label className="field-label" htmlFor="append-json">
                JSON array of rows
              </label>
              <TextArea
                id="append-json"
                className="min-h-48 w-full rounded-md border p-3 font-mono text-xs leading-6"
                {...append.register("json")}
              />
              <p className="field-error">
                {append.formState.errors.json?.message}
              </p>
              <Button type="submit" isDisabled={busy} className="w-full">
                {busy ? "Writing…" : "Append rows"}
              </Button>
            </form>
          )}
          {dialog === "column" && (
            <form
              className="space-y-4"
              onSubmit={column.handleSubmit((value) =>
                mutate({ add_columns: [{ ...value, required: false }] }),
              )}
            >
              <label className="field-label" htmlFor="column-name">
                Column name
              </label>
              <Input id="column-name" {...column.register("name")} />
              <p className="field-error">
                {column.formState.errors.name?.message}
              </p>
              <label className="field-label" htmlFor="column-type">
                Column type
              </label>
              <FormSelect
                control={column.control}
                name="type"
                id="column-type"
                label="Column type"
                options={[
                  "string",
                  "long",
                  "int",
                  "double",
                  "boolean",
                  "date",
                  "timestamp",
                  "timestamptz",
                ].map((t) => ({ value: t, label: t }))}
                isDisabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                The new column is nullable. Existing rows will contain NULL.
              </p>
              <Button type="submit" isDisabled={busy} className="w-full">
                {busy ? "Adding…" : "Add column"}
              </Button>
            </form>
          )}
          {(dialog === "drop" || dialog === "deleteRows") && (
            <div className="space-y-4">
              {dialog === "deleteRows" && (
                <div>
                  <label className="field-label" htmlFor="delete-filter">
                    Deletion filter
                  </label>
                  <Input
                    id="delete-filter"
                    value={deleteFilter}
                    onChange={(e) => setDeleteFilter(e.target.value)}
                    placeholder="e.g. id = 1"
                  />
                </div>
              )}
              <label className="field-label" htmlFor="confirm-table">
                Type {namespace}.{name} to confirm
              </label>
              <Input
                id="confirm-table"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  isDisabled={busy}
                  onPress={() => setDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={
                    busy ||
                    confirmation !== `${namespace}.${name}` ||
                    (dialog === "deleteRows" && !deleteFilter.trim())
                  }
                  onPress={() =>
                    mutate(
                      null,
                      "DELETE",
                      dialog === "drop"
                        ? ""
                        : `/rows?filter=${encodeURIComponent(deleteFilter.trim())}`,
                    )
                  }
                >
                  {busy ? "Processing…" : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
