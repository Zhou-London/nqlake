"use client";
import { useState, type FormEvent } from "react";
import {
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
  Divider,
  EmptyState,
  FileUpload,
  Form,
  Link,
  PageContent,
  PageHeader,
  Row,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableContainer,
  TableHeader,
  TextField,
  buttonStyles,
} from "@nowquant/nqui";
import { ArrowRight, CheckCircle2, FileCheck2, Upload } from "lucide-react";
import { useLake } from "@/components/lake-provider";
import {
  api,
  tablePath,
  tableHref,
  type Inspection,
  type UploadResult,
} from "@/lib/api";
import { number } from "@/lib/utils";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export default function Imports() {
  const { namespaces, refresh } = useLake();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [lossy, setLossy] = useState(false);
  const [namespace, setNamespace] = useState("");
  const [table, setTable] = useState("");
  const [mode, setMode] = useState("append");
  const [create, setCreate] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const lossyRepairs = !!inspection?.repairs.some((r) => r.lossy);

  function choose(selected?: File) {
    if (busy || submitting) return;
    setError("");
    setInspection(null);
    setResult(null);
    setLossy(false);
    setFile(selected ?? null);
    if (!selected) return;
    if (!table)
      setTable(
        selected.name.replace(/\.parquet$/i, "").replace(/[^a-zA-Z0-9_]/g, "_"),
      );
    if (!namespace && namespaces[0]) setNamespace(namespaces[0]);
  }
  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError("");
    setInspection(null);
    setLossy(false);
    try {
      const body = new FormData();
      body.append("file", file);
      setInspection(
        await api<Inspection>("/parquet/inspect", { method: "POST", body }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !inspection || (lossyRepairs && !lossy)) return;
    setError("");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      body.append("create", String(create));
      const data = await api<UploadResult>(
        `${tablePath(namespace, table.trim())}/parquet`,
        { method: "POST", body },
      );
      setResult(data);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  function startOver() {
    setResult(null);
    setFile(null);
    setInspection(null);
    setLossy(false);
    setTable("");
    setMode("append");
    setCreate(true);
    setConfirm(false);
  }
  const blocked = !inspection
    ? "Inspect the file first"
    : lossyRepairs && !lossy
      ? "Approve the precision loss"
      : mode === "overwrite" && !confirm
        ? "Confirm the overwrite"
        : undefined;

  return (
    <>
      <PageHeader
        title="Import data"
        description="Bring Parquet data into your lakehouse: choose a file, inspect its schema, then import."
      />
      <PageContent>
        {error && <Alert color="error" title={error} />}
        {result ? (
          <Card className="mx-auto w-full max-w-2xl">
            <EmptyState
              size="lg"
              icon={<CheckCircle2 className="text-success-text" />}
              title="Import complete"
              description={
                <>
                  {number(result.rows)} rows{" "}
                  {result.mode === "overwrite"
                    ? "overwritten in"
                    : "appended to"}{" "}
                  <Code>
                    {result.namespace}.{result.table}
                  </Code>
                  <br />
                  Snapshot <Code>{String(result.snapshot_id ?? "—")}</Code>
                </>
              }
              actions={
                <>
                  <Button variant="outline" onPress={startOver}>
                    Import another file
                  </Button>
                  <Link
                    href={tableHref(result.namespace, result.table)}
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
            {result.repairs.length > 0 && (
              <CardBody>
                <Alert
                  color="info"
                  title={`${result.repairs.length} type conversions applied`}
                  description={
                    <ul className="mt-1 flex flex-col gap-1">
                      {result.repairs.map((r, i) => (
                        <li key={i}>
                          <Code>{r.column}</Code>: {r.from_type} → {r.to_type}
                          {r.lossy ? " (precision truncated)" : ""}
                        </li>
                      ))}
                    </ul>
                  }
                />
              </CardBody>
            )}
          </Card>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardBody className="flex flex-col gap-4">
                  <FileUpload
                    label="Source file"
                    description="Parquet files only · One file at a time"
                    buttonLabel="Choose file"
                    accept={[".parquet"]}
                    isDisabled={busy || submitting}
                    files={
                      file
                        ? [
                            {
                              id: file.name,
                              name: file.name,
                              size: file.size,
                              status: inspection ? "done" : "queued",
                            },
                          ]
                        : []
                    }
                    onSelect={(files) => choose(files[0])}
                    onReject={() => setError("Select a .parquet file.")}
                    onRemove={() => choose(undefined)}
                  />
                </CardBody>
                <CardFooter>
                  <Button
                    variant="outline"
                    startContent={<FileCheck2 />}
                    isLoading={busy}
                    disabledReason={file ? undefined : "Choose a file first"}
                    isDisabled={submitting}
                    onPress={inspect}
                  >
                    Inspect file
                  </Button>
                </CardFooter>
              </Card>
              {inspection && (
                <Card>
                  <CardHeader className="items-center">
                    <CardTitle>Schema inspection</CardTitle>
                    <Chip color="neutral">
                      {number(inspection.rows)} rows ·{" "}
                      {inspection.columns.length} columns
                    </Chip>
                  </CardHeader>
                  <TableContainer bare className="max-h-72">
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
                  <Divider />
                  <CardBody className="flex flex-col gap-3">
                    {inspection.repairs.length ? (
                      inspection.repairs.map((r, i) => (
                        <Alert
                          key={i}
                          color={r.lossy ? "warning" : "info"}
                          title={
                            <>
                              <Code>{r.column}</Code> · {r.from_type} →{" "}
                              {r.to_type}
                            </>
                          }
                          description={
                            r.reason +
                            (r.lossy
                              ? " · This conversion loses precision"
                              : "")
                          }
                        />
                      ))
                    ) : (
                      <Alert
                        color="success"
                        title="All columns are compatible. No conversions needed."
                      />
                    )}
                    {lossyRepairs && (
                      <Checkbox
                        isSelected={lossy}
                        onChange={setLossy}
                        isDisabled={submitting}
                      >
                        I understand the precision loss and approve these
                        conversions.
                      </Checkbox>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
            <Card>
              <Form onSubmit={upload}>
                <CardHeader>
                  <CardTitle>Import settings</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <Select
                    label="Namespace"
                    name="namespace"
                    placeholder="Select a namespace"
                    isRequired
                    isDisabled={submitting}
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
                    isDisabled={submitting}
                    value={table}
                    onChange={setTable}
                    validate={(value) =>
                      IDENTIFIER.test(value.trim())
                        ? null
                        : "Enter a valid table name."
                    }
                  />
                  <Select
                    label="Write mode"
                    name="mode"
                    isDisabled={submitting}
                    selectedKey={mode}
                    onSelectionChange={(key) => setMode(String(key))}
                  >
                    <SelectItem id="append">Append data</SelectItem>
                    <SelectItem id="overwrite">Overwrite all data</SelectItem>
                  </Select>
                  <Checkbox
                    isSelected={create}
                    onChange={setCreate}
                    isDisabled={submitting}
                  >
                    Create if not exist
                  </Checkbox>
                  {mode === "overwrite" && (
                    <Alert color="warning" hideIcon>
                      <Checkbox
                        isSelected={confirm}
                        onChange={setConfirm}
                        isDisabled={submitting}
                      >
                        I confirm replacing all rows in the destination table
                      </Checkbox>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    color="primary"
                    fullWidth
                    startContent={<Upload />}
                    isLoading={submitting}
                    isDisabled={busy}
                    disabledReason={blocked}
                  >
                    Import file
                  </Button>
                </CardBody>
              </Form>
            </Card>
          </div>
        )}
      </PageContent>
    </>
  );
}
