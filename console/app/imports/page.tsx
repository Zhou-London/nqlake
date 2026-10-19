"use client";
import { useState, type FormEvent } from "react";
import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Cell,
  Checkbox,
  Chip,
  Code,
  Column,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  FileUpload,
  Form,
  Link,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  PageContent,
  PageHeader,
  Row,
  SearchField,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableContainer,
  TableHeader,
  TextField,
  buttonStyles,
} from "@nowquant/nqui";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  TableProperties,
  Upload,
} from "lucide-react";
import { useLake } from "@/components/lake-provider";
import {
  api,
  tablePath,
  tableHref,
  type Inspection,
  type LakeTable,
  type Repair,
  type UploadResult,
} from "@/lib/api";
import { number } from "@/lib/utils";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** One chosen file and what the backend has said about it so far. */
type Item = {
  id: string;
  file: File;
  /** Set once `/parquet/inspect` accepted the file. */
  inspection?: Inspection;
  /** Set when inspecting or importing the file failed. */
  error?: string;
  /** Set once the file was imported. */
  result?: UploadResult;
  busy?: boolean;
};

const tableName = (file: File) =>
  file.name.replace(/\.parquet$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
const lossyRepairsOf = (item: Item) =>
  item.inspection?.repairs.filter((r) => r.lossy) ?? [];

export default function Imports() {
  const { namespaces, tables, refresh } = useLake();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lossy, setLossy] = useState(false);
  const [namespace, setNamespace] = useState("");
  const [table, setTable] = useState("");
  const [mode, setMode] = useState("append");
  const [create, setCreate] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [warning, setWarning] = useState(false);
  const [picker, setPicker] = useState(false);

  // The one button inspects until every file was inspected, then imports.
  const inspected =
    items.length > 0 && items.every((item) => item.inspection || item.error);
  const failed = items.filter((item) => item.error);
  const lossyItems = items.filter((item) => lossyRepairsOf(item).length);
  const pending = items.filter((item) => !item.result);
  const done = items.length > 0 && items.every((item) => item.result);

  function patch(id: string, changes: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }
  function add(files: File[]) {
    if (busy) return;
    setError("");
    setLossy(false);
    setItems((current) => {
      const known = new Set(current.map((item) => item.id));
      const fresh = files
        .filter((file) => !known.has(file.name))
        .map((file) => ({ id: file.name, file }));
      return [...current, ...fresh];
    });
    if (!table && files[0]) setTable(tableName(files[0]));
    if (!namespace && namespaces[0]) setNamespace(namespaces[0]);
  }
  function remove(id: string) {
    if (busy) return;
    setError("");
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function inspectAll() {
    setBusy(true);
    setError("");
    setLossy(false);
    let problems = false;
    for (const item of items) {
      if (item.inspection || item.error) continue;
      patch(item.id, { busy: true });
      try {
        const body = new FormData();
        body.append("file", item.file);
        const inspection = await api<Inspection>("/parquet/inspect", {
          method: "POST",
          body,
        });
        patch(item.id, { inspection, busy: false });
        problems ||= inspection.repairs.some((r) => r.lossy);
      } catch (err) {
        patch(item.id, { error: (err as Error).message, busy: false });
        problems = true;
      }
    }
    setBusy(false);
    if (problems) setWarning(true);
  }
  async function importAll() {
    setBusy(true);
    setError("");
    // The chosen mode applies to the first file; an overwrite that spanned
    // every file would leave only the last one. The rest are appended.
    let first = true;
    for (const item of items) {
      if (item.result || item.error) continue;
      patch(item.id, { busy: true });
      try {
        const body = new FormData();
        body.append("file", item.file);
        body.append("mode", first ? mode : "append");
        body.append("create", String(create));
        const result = await api<UploadResult>(
          `${tablePath(namespace, table.trim())}/parquet`,
          { method: "POST", body },
        );
        patch(item.id, { result, busy: false });
        first = false;
      } catch (err) {
        patch(item.id, { error: (err as Error).message, busy: false });
        setError(`${item.file.name}: ${(err as Error).message}`);
        break;
      }
    }
    setBusy(false);
    await refresh();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    void (inspected ? importAll() : inspectAll());
  }
  function startOver() {
    setItems([]);
    setError("");
    setLossy(false);
    setTable("");
    setMode("append");
    setCreate(true);
    setConfirm(false);
  }
  const blocked = !items.length
    ? "Choose files first"
    : !inspected
      ? undefined
      : failed.length
        ? "Remove the files that failed inspection"
        : lossyItems.length && !lossy
          ? "Approve the precision loss"
          : mode === "overwrite" && !confirm
            ? "Confirm the overwrite"
            : undefined;

  const results = items.flatMap((item) => (item.result ? [item.result] : []));
  const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
  const last = results[results.length - 1];

  return (
    <>
      <PageHeader
        title="Import data"
        description="Bring Parquet data into your lakehouse: choose files, inspect their schemas, then import them into one table."
      />
      <PageContent>
        {error && <Alert color="error" title={error} />}
        {done && last ? (
          <Card className="mx-auto w-full max-w-2xl">
            <EmptyState
              size="lg"
              icon={<CheckCircle2 className="text-success-text" />}
              title="Import complete"
              description={
                <>
                  {number(totalRows)} rows from {results.length}{" "}
                  {results.length === 1 ? "file" : "files"}{" "}
                  {mode === "overwrite" ? "written to" : "appended to"}{" "}
                  <Code>
                    {last.namespace}.{last.table}
                  </Code>
                  <br />
                  Snapshot <Code>{String(last.snapshot_id ?? "—")}</Code>
                </>
              }
              actions={
                <>
                  <Button variant="outline" onPress={startOver}>
                    Import more files
                  </Button>
                  <Link
                    href={tableHref(last.namespace, last.table)}
                    className={buttonStyles({
                      variant: "solid",
                      color: "primary",
                    })}
                  >
                    View table
                    <ArrowRight />
                  </Link>
                </>
              }
            />
            <CardBody className="flex flex-col gap-3">
              {items.map((item) =>
                item.result ? (
                  <Alert
                    key={item.id}
                    color={item.result.repairs.length ? "info" : "success"}
                    title={`${item.file.name} · ${number(item.result.rows)} rows${
                      item.result.repairs.length
                        ? ` · ${item.result.repairs.length} type conversions`
                        : ""
                    }`}
                    description={
                      item.result.repairs.length ? (
                        <RepairList repairs={item.result.repairs} />
                      ) : undefined
                    }
                  />
                ) : null,
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardBody className="flex flex-col gap-4">
                  <FileUpload
                    label="Source files"
                    description="Parquet files only · Every file goes into the same table"
                    buttonLabel="Choose files"
                    accept={[".parquet"]}
                    multiple
                    isDisabled={busy}
                    files={items.map((item) => ({
                      id: item.id,
                      name: item.file.name,
                      size: item.file.size,
                      status: item.busy
                        ? "uploading"
                        : item.error
                          ? "error"
                          : item.result || item.inspection
                            ? "done"
                            : "queued",
                      error: item.error,
                    }))}
                    onSelect={add}
                    onReject={() => setError("Select .parquet files.")}
                    onRemove={remove}
                  />
                </CardBody>
                {inspected && (
                  <CardFooter>
                    <Chip color={failed.length ? "error" : "success"}>
                      {failed.length
                        ? `${failed.length} of ${items.length} files failed inspection`
                        : `${items.length} ${items.length === 1 ? "file" : "files"} inspected`}
                    </Chip>
                  </CardFooter>
                )}
              </Card>
              {items.some((item) => item.inspection) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Schema inspection</CardTitle>
                  </CardHeader>
                  <Accordion
                    variant="divided"
                    allowsMultipleExpanded
                    defaultExpandedKeys={items.map((item) => item.id)}
                  >
                    {items.map((item) =>
                      item.inspection ? (
                        <AccordionItem
                          key={item.id}
                          id={item.id}
                          title={item.file.name}
                          subtitle={`${number(item.inspection.rows)} rows · ${item.inspection.columns.length} columns${
                            item.inspection.repairs.length
                              ? ` · ${item.inspection.repairs.length} conversions`
                              : ""
                          }`}
                        >
                          <InspectionDetail inspection={item.inspection} />
                        </AccordionItem>
                      ) : null,
                    )}
                  </Accordion>
                  {lossyItems.length > 0 && (
                    <CardBody>
                      <Checkbox
                        isSelected={lossy}
                        onChange={setLossy}
                        isDisabled={busy}
                      >
                        I understand the precision loss and approve these
                        conversions.
                      </Checkbox>
                    </CardBody>
                  )}
                </Card>
              )}
            </div>
            <Card>
              <Form onSubmit={submit}>
                <CardHeader>
                  <CardTitle>Import settings</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <Select
                    label="Namespace"
                    name="namespace"
                    placeholder="Select a namespace"
                    isRequired
                    isDisabled={busy}
                    selectedKey={namespace || null}
                    onSelectionChange={(key) => setNamespace(String(key ?? ""))}
                    description={
                      namespaces.length
                        ? undefined
                        : "Connect the service and create a namespace in the catalog."
                    }
                  >
                    {namespaces.map((ns) => (
                      <SelectItem key={ns} id={ns}>
                        {ns}
                      </SelectItem>
                    ))}
                  </Select>
                  <TextField
                    name="table"
                    label="Destination table"
                    placeholder="e.g. market_events"
                    isRequired
                    isDisabled={busy}
                    value={table}
                    onChange={setTable}
                    validate={(value) =>
                      IDENTIFIER.test(value.trim())
                        ? null
                        : "Enter a valid table name."
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    startContent={<TableProperties />}
                    isDisabled={busy}
                    disabledReason={
                      tables.length ? undefined : "The catalog has no tables"
                    }
                    onPress={() => setPicker(true)}
                  >
                    Choose an existing table
                  </Button>
                  <Select
                    label="Write mode"
                    name="mode"
                    isDisabled={busy}
                    selectedKey={mode}
                    onSelectionChange={(key) => setMode(String(key))}
                  >
                    <SelectItem id="append">Append data</SelectItem>
                    <SelectItem id="overwrite">Overwrite all data</SelectItem>
                  </Select>
                  <Checkbox
                    isSelected={create}
                    onChange={setCreate}
                    isDisabled={busy}
                  >
                    Create if not exist
                  </Checkbox>
                  {mode === "overwrite" && (
                    <Alert
                      color="warning"
                      hideIcon
                      description={
                        items.length > 1
                          ? "The first file replaces every row; the other files are appended after it."
                          : undefined
                      }
                    >
                      <Checkbox
                        isSelected={confirm}
                        onChange={setConfirm}
                        isDisabled={busy}
                      >
                        I confirm replacing all rows in the destination table
                      </Checkbox>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    color="primary"
                    fullWidth
                    startContent={inspected ? <Upload /> : <FileCheck2 />}
                    isLoading={busy}
                    disabledReason={blocked}
                  >
                    {inspected
                      ? `Import ${pending.length} ${pending.length === 1 ? "file" : "files"}`
                      : items.length
                        ? `Inspect ${items.length} ${items.length === 1 ? "file" : "files"}`
                        : "Inspect files"}
                  </Button>
                </CardBody>
              </Form>
            </Card>
          </div>
        )}
      </PageContent>
      <InspectionWarning
        isOpen={warning}
        failed={failed}
        lossyItems={lossyItems}
        approved={lossy}
        onApprove={setLossy}
        onClose={() => setWarning(false)}
      />
      <TablePicker
        isOpen={picker}
        tables={tables}
        onClose={() => setPicker(false)}
        onPick={(picked) => {
          setNamespace(picked.namespace);
          setTable(picked.name);
          setPicker(false);
        }}
      />
    </>
  );
}

function RepairList({ repairs }: { repairs: Repair[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {repairs.map((r, i) => (
        <li key={i}>
          <Code>{r.column}</Code>: {r.from_type} → {r.to_type}
          {r.lossy ? " (precision truncated)" : ""}
        </li>
      ))}
    </ul>
  );
}

/** The columns of one inspected file and the conversions an import would apply. */
function InspectionDetail({ inspection }: { inspection: Inspection }) {
  return (
    <div className="flex flex-col gap-3">
      <TableContainer bare className="max-h-60">
        <Table aria-label="Inspected columns" density="compact">
          <TableHeader>
            <Column isRowHeader>Column</Column>
            <Column>Parquet type</Column>
            <Column>Iceberg type</Column>
          </TableHeader>
          <TableBody>
            {inspection.columns.map((c) => (
              <Row key={c.name} id={c.name}>
                <Cell>
                  <Code>{c.name}</Code>
                </Cell>
                <Cell className="text-muted">{c.parquet_type}</Cell>
                <Cell>
                  <Code color="primary">{c.iceberg_type}</Code>
                </Cell>
              </Row>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {inspection.repairs.length ? (
        inspection.repairs.map((r, i) => (
          <Alert
            key={i}
            color={r.lossy ? "warning" : "info"}
            title={
              <>
                <Code>{r.column}</Code> · {r.from_type} → {r.to_type}
              </>
            }
            description={
              r.reason + (r.lossy ? " · This conversion loses precision" : "")
            }
          />
        ))
      ) : (
        <Alert
          color="success"
          title="All columns are compatible. No conversions needed."
        />
      )}
    </div>
  );
}

/** Shown after an inspection found a file to reject or a conversion that loses precision. */
function InspectionWarning({
  isOpen,
  failed,
  lossyItems,
  approved,
  onApprove,
  onClose,
}: {
  isOpen: boolean;
  failed: Item[];
  lossyItems: Item[];
  approved: boolean;
  onApprove: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog>
        <DialogHeader
          title="Inspection found problems"
          description="Review them before the files are imported."
          showClose
        />
        <DialogBody className="flex flex-col gap-3">
          {failed.map((item) => (
            <Alert
              key={item.id}
              color="error"
              title={item.file.name}
              description={`${item.error} Remove this file to import the others.`}
            />
          ))}
          {lossyItems.map((item) => (
            <Alert
              key={item.id}
              color="warning"
              title={`${item.file.name} · conversions that lose precision`}
              description={<RepairList repairs={lossyRepairsOf(item)} />}
            />
          ))}
          {lossyItems.length > 0 && (
            <Checkbox isSelected={approved} onChange={onApprove}>
              I understand the precision loss and approve these conversions.
            </Checkbox>
          )}
        </DialogBody>
        <DialogFooter>
          <Button color="primary" onPress={onClose}>
            {lossyItems.length && !failed.length
              ? "Continue to import"
              : "Back to the files"}
          </Button>
        </DialogFooter>
      </Dialog>
    </Modal>
  );
}

/** Lets the user pick a destination among the tables the catalog already holds. */
function TablePicker({
  isOpen,
  tables,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  tables: LakeTable[];
  onClose: () => void;
  onPick: (table: LakeTable) => void;
}) {
  const [term, setTerm] = useState("");
  const needle = term.trim().toLowerCase();
  const matching = tables.filter(
    (t) =>
      !needle ||
      t.name.toLowerCase().includes(needle) ||
      t.namespace.toLowerCase().includes(needle),
  );
  const groups = Array.from(new Set(matching.map((t) => t.namespace))).map(
    (namespace) => ({
      namespace,
      tables: matching.filter((t) => t.namespace === namespace),
    }),
  );
  return (
    <Modal
      size="sm"
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog>
        <DialogHeader
          title="Choose an existing table"
          description="The files are appended to it, or replace its rows in overwrite mode."
          showClose
        />
        <DialogBody className="flex flex-col gap-3">
          <SearchField
            aria-label="Find a table"
            size="sm"
            placeholder="Find a table…"
            autoFocus
            value={term}
            onChange={setTerm}
          />
          {groups.length ? (
            <ListBox
              aria-label="Existing tables"
              className="max-h-80 overflow-auto"
              selectionMode="single"
              onAction={(key) => {
                const picked = tables.find(
                  (t) => `${t.namespace}.${t.name}` === String(key),
                );
                if (picked) onPick(picked);
              }}
            >
              {groups.map((group) => (
                <ListBoxSection key={group.namespace} title={group.namespace}>
                  {group.tables.map((t) => (
                    <ListBoxItem
                      key={`${t.namespace}.${t.name}`}
                      id={`${t.namespace}.${t.name}`}
                      textValue={t.name}
                      description={`${t.columns.length} columns${
                        t.row_count != null
                          ? ` · ${number(t.row_count)} rows`
                          : ""
                      }`}
                    >
                      {t.name}
                    </ListBoxItem>
                  ))}
                </ListBoxSection>
              ))}
            </ListBox>
          ) : (
            <EmptyState
              size="sm"
              title="No matching table"
              description="Type a new name in the destination field instead."
            />
          )}
        </DialogBody>
      </Dialog>
    </Modal>
  );
}
