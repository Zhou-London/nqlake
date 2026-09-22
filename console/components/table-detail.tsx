"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardRow,
  CardStack,
  CardTitle,
  Cell,
  Code,
  Column,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Divider,
  EmptyState,
  Form,
  JsonViewer,
  KpiCard,
  Link,
  Modal,
  PageContent,
  PageHeader,
  Row,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Table,
  TableBody,
  TableContainer,
  TableHeader,
  TextArea,
  TextField,
  buttonStyles,
  toast,
} from "@nowquant/nqui";
import {
  ArrowLeft,
  Filter,
  Plus,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { RowsGrid } from "@/components/rows-grid";
import { COLUMN_TYPES } from "@/components/catalog-actions";
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

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
type Action = "rename" | "append" | "drop" | "column" | "deleteRows";
const actions: {
  kind: Action;
  title: string;
  description: string;
  action: string;
  danger?: boolean;
}[] = [
  {
    kind: "rename",
    title: "Rename table",
    description:
      "Change the catalog name. Update existing queries to use the new name.",
    action: "Rename",
  },
  {
    kind: "append",
    title: "Append JSON rows",
    description: "Append a JSON array of rows matching the table schema.",
    action: "Append data",
  },
  {
    kind: "deleteRows",
    title: "Delete rows by filter",
    description: "Remove rows matching an Iceberg filter expression.",
    action: "Delete rows",
    danger: true,
  },
  {
    kind: "drop",
    title: "Remove table from catalog",
    description:
      "Remove the catalog entry and keep storage files. Confirm the table name to proceed.",
    action: "Remove table",
    danger: true,
  },
];
const titles: Record<Action, string> = {
  rename: "Rename table",
  append: "Append JSON rows",
  column: "Add column",
  deleteRows: "Delete matching rows",
  drop: "Remove table",
};

function validJsonRows(value: string) {
  try {
    const rows = JSON.parse(value);
    return (
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every(
        (row) => row !== null && typeof row === "object" && !Array.isArray(row),
      )
    );
  } catch {
    return false;
  }
}

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
  const full = `${namespace}.${name}`;
  const [table, setTable] = useState<LakeTable | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [rowsError, setRowsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState("100");
  const [dialog, setDialog] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteFilter, setDeleteFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const pending = loading && !table;

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
    try {
      const query = new URLSearchParams({ limit });
      if (filter.trim()) query.set("filter", filter.trim());
      setRows(await api<Rows>(`${path}/rows?${query}`));
    } catch (err) {
      setRowsError((err as Error).message);
    } finally {
      setRowsLoading(false);
    }
  }
  function open(value: Action) {
    setActionError("");
    setConfirmation("");
    setDeleteFilter("");
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
  function field(event: FormEvent<HTMLFormElement>, key: string) {
    return String(new FormData(event.currentTarget).get(key) ?? "").trim();
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/catalog" variant="muted" className="text-sm">
            <ArrowLeft />
            Back to catalog
          </Link>
        }
        title={name}
        description={`${namespace} · Explore the schema, preview rows, and manage your Iceberg table.`}
        actions={
          <>
            <Button
              variant="outline"
              startContent={<RefreshCw />}
              isLoading={loading || rowsLoading}
              onPress={() => {
                void load();
                void loadRows();
              }}
            >
              Refresh
            </Button>
            <Link
              href={`/query?sql=${encodeURIComponent(tableSql(namespace, name))}`}
              className={buttonStyles({ variant: "solid", color: "primary" })}
            >
              <TerminalSquare />
              Query table
            </Link>
          </>
        }
      />
      <PageContent>
        {error && (
          <Alert
            color="error"
            title={error}
            actions={
              <Button size="sm" variant="outline" onPress={() => load()}>
                Retry
              </Button>
            }
          />
        )}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            size="sm"
            label="Total rows"
            value={table ? number(table.row_count) : "—"}
            isLoading={pending}
          />
          <KpiCard
            size="sm"
            label="Columns"
            value={table?.columns.length ?? "—"}
            isLoading={pending}
          />
          <KpiCard
            size="sm"
            label="Snapshots"
            value={table?.snapshot_count ?? "—"}
            isLoading={pending}
          />
          <KpiCard
            size="sm"
            label="Table format"
            value={table ? `Iceberg v${table.format_version}` : "—"}
            isLoading={pending}
          />
        </div>
        {table && (
          <Tabs defaultSelectedKey="data">
            <TabList aria-label="Table details">
              <Tab id="data">Data preview</Tab>
              <Tab id="schema">Schema</Tab>
              <Tab id="metadata">Metadata</Tab>
              <Tab id="manage">Manage</Tab>
            </TabList>
            <TabPanel id="data">
              <Card>
                <CardHeader>
                  <Form
                    className="flex flex-1 flex-row flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void loadRows();
                    }}
                  >
                    <TextField
                      aria-label="Iceberg row filter"
                      className="min-w-56 flex-1 font-mono"
                      size="sm"
                      startContent={<Filter />}
                      placeholder="Filter, e.g. price > 10 AND side = 'A'"
                      value={filter}
                      onChange={setFilter}
                    />
                    <Select
                      aria-label="Preview limit"
                      size="sm"
                      className="w-32"
                      selectedKey={limit}
                      onSelectionChange={(key) => setLimit(String(key))}
                    >
                      {[100, 500, 1000].map((n) => (
                        <SelectItem key={n} id={String(n)}>
                          {`${n} rows`}
                        </SelectItem>
                      ))}
                    </Select>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      isLoading={rowsLoading}
                    >
                      Apply filter
                    </Button>
                  </Form>
                </CardHeader>
                {rowsError && (
                  <CardBody>
                    <Alert
                      color="error"
                      title={rowsError}
                      actions={
                        <Button size="sm" variant="outline" onPress={loadRows}>
                          Retry
                        </Button>
                      }
                    />
                  </CardBody>
                )}
                <RowsGrid
                  data={rows}
                  isLoading={rowsLoading}
                  filename={full}
                  emptyState={
                    rowsError ? (
                      <EmptyState
                        size="sm"
                        title="No rows to show"
                        description="Adjust the filter and apply it again."
                      />
                    ) : undefined
                  }
                />
              </Card>
            </TabPanel>
            <TabPanel id="schema">
              <Card>
                <CardHeader className="items-center">
                  <CardTitle>Columns</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    startContent={<Plus />}
                    onPress={() => open("column")}
                  >
                    Add column
                  </Button>
                </CardHeader>
                <TableContainer bare>
                  <Table aria-label="Table columns">
                    <TableHeader>
                      <Column>ID</Column>
                      <Column isRowHeader>Column name</Column>
                      <Column>Type</Column>
                      <Column>Nullable</Column>
                      <Column>Description</Column>
                    </TableHeader>
                    <TableBody>
                      {table.columns.map((c) => (
                        <Row key={c.id} id={c.id}>
                          <Cell className="text-muted" numeric>
                            {c.id}
                          </Cell>
                          <Cell>
                            <Code>{c.name}</Code>
                          </Cell>
                          <Cell>
                            <Code color="primary">{c.type}</Code>
                          </Cell>
                          <Cell>{c.required ? "No" : "Yes"}</Cell>
                          <Cell className="text-muted">{c.doc || "—"}</Cell>
                        </Row>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            </TabPanel>
            <TabPanel id="metadata">
              <Card>
                <CardHeader>
                  <CardTitle>Table metadata</CardTitle>
                </CardHeader>
                <TableContainer bare>
                  <Table aria-label="Table metadata">
                    <TableHeader>
                      <Column isRowHeader>Property</Column>
                      <Column>Value</Column>
                    </TableHeader>
                    <TableBody>
                      {[
                        { key: "Namespace", value: namespace },
                        { key: "Storage location", value: table.location },
                        {
                          key: "Current snapshot ID",
                          value: String(table.snapshot_id ?? "No snapshots"),
                        },
                        {
                          key: "Snapshot time",
                          value: date(table.snapshot_at),
                        },
                        {
                          key: "Partitioning",
                          value:
                            table.partition_by.join(", ") || "Unpartitioned",
                        },
                      ].map((item) => (
                        <Row key={item.key} id={item.key}>
                          <Cell className="text-muted">{item.key}</Cell>
                          <Cell className="whitespace-normal break-all">
                            <Code>{item.value}</Code>
                          </Cell>
                        </Row>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Divider />
                <CardHeader>
                  <CardTitle>Table properties</CardTitle>
                </CardHeader>
                <CardBody>
                  <JsonViewer value={table.properties} copyable />
                </CardBody>
              </Card>
            </TabPanel>
            <TabPanel id="manage">
              <CardStack>
                {actions.map((item) => (
                  <CardRow
                    key={item.kind}
                    title={item.title}
                    description={item.description}
                    showChevron={false}
                    endContent={
                      <Button
                        variant="outline"
                        color={item.danger ? "error" : "accent"}
                        onPress={() => open(item.kind)}
                      >
                        {item.action}
                      </Button>
                    }
                  />
                ))}
              </CardStack>
            </TabPanel>
          </Tabs>
        )}
      </PageContent>
      <Modal
        isOpen={!!dialog}
        onOpenChange={(value) => {
          if (!value && !busy) setDialog(null);
        }}
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Dialog>
          {dialog && (
            <DialogHeader
              title={titles[dialog]}
              description={
                dialog === "drop"
                  ? `This removes ${full} from the catalog and keeps its storage files.`
                  : dialog === "deleteRows"
                    ? "Rows matching the filter will be deleted. A filter of true deletes all rows."
                    : "Changes apply directly to this table."
              }
              showClose
            />
          )}
          {dialog === "rename" && (
            <Form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate({ rename_to: field(event, "name") });
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                {actionError && <Alert color="error" title={actionError} />}
                <TextField
                  name="name"
                  label="New table name"
                  defaultValue={name}
                  autoFocus
                  isRequired
                  isDisabled={busy}
                  validate={(value) =>
                    IDENTIFIER.test(value.trim())
                      ? null
                      : "Enter a valid table name."
                  }
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="submit"
                  color="primary"
                  fullWidth
                  isLoading={busy}
                >
                  Save name
                </Button>
              </DialogFooter>
            </Form>
          )}
          {dialog === "append" && (
            <Form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(
                  null,
                  "POST",
                  "/rows",
                  `{"rows":${field(event, "json")}}`,
                );
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                {actionError && <Alert color="error" title={actionError} />}
                <TextArea
                  name="json"
                  label="JSON array of rows"
                  rows={8}
                  className="font-mono"
                  defaultValue={'[\n  {"id": 1}\n]'}
                  isRequired
                  isDisabled={busy}
                  validate={(value) =>
                    validJsonRows(value)
                      ? null
                      : "Enter a JSON array containing at least one object."
                  }
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="submit"
                  color="primary"
                  fullWidth
                  isLoading={busy}
                >
                  Append rows
                </Button>
              </DialogFooter>
            </Form>
          )}
          {dialog === "column" && (
            <Form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate({
                  add_columns: [
                    {
                      name: field(event, "name"),
                      type: field(event, "type"),
                      required: false,
                    },
                  ],
                });
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                {actionError && <Alert color="error" title={actionError} />}
                <TextField
                  name="name"
                  label="Column name"
                  autoFocus
                  isRequired
                  isDisabled={busy}
                  validate={(value) =>
                    IDENTIFIER.test(value.trim())
                      ? null
                      : "Enter a valid column name."
                  }
                />
                <Select
                  name="type"
                  label="Column type"
                  defaultSelectedKey="string"
                  isDisabled={busy}
                  description="The new column is nullable. Existing rows will contain NULL."
                >
                  {COLUMN_TYPES.map((type) => (
                    <SelectItem key={type} id={type}>
                      {type}
                    </SelectItem>
                  ))}
                </Select>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="submit"
                  color="primary"
                  fullWidth
                  isLoading={busy}
                >
                  Add column
                </Button>
              </DialogFooter>
            </Form>
          )}
          {(dialog === "drop" || dialog === "deleteRows") && (
            <>
              <DialogBody className="flex flex-col gap-4">
                {actionError && <Alert color="error" title={actionError} />}
                {dialog === "deleteRows" && (
                  <TextField
                    label="Deletion filter"
                    className="font-mono"
                    placeholder="e.g. id = 1"
                    autoFocus
                    isDisabled={busy}
                    value={deleteFilter}
                    onChange={setDeleteFilter}
                  />
                )}
                <TextField
                  label={`Type ${full} to confirm`}
                  isDisabled={busy}
                  value={confirmation}
                  onChange={setConfirmation}
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="ghost"
                  isDisabled={busy}
                  onPress={() => setDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  color="error"
                  isLoading={busy}
                  disabledReason={
                    confirmation !== full
                      ? "Type the table name to confirm"
                      : dialog === "deleteRows" && !deleteFilter.trim()
                        ? "Enter a filter"
                        : undefined
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
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </Dialog>
      </Modal>
    </>
  );
}
