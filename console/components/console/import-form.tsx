"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  FileUp,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorNotice } from "@/components/console/error-notice";
import { tableHref } from "@/components/console/nav";
import { PageHeader } from "@/components/console/page-header";
import { api, ApiError, errorMessage } from "@/lib/api";
import { emitCatalogChange, useCatalogVersion } from "@/lib/events";
import { formatBytes, formatCount } from "@/lib/format";
import { importSchema, type ImportForm as ImportValues } from "@/lib/schemas";
import type { Inspect, Repair, Upload as UploadResult } from "@/lib/types";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

type Failure = { message: string; problems: string[] };

export function ImportForm() {
  const version = useCatalogVersion();
  const namespaces = useResource(api.namespaces, `namespaces:${version}`);
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<Failure | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<Failure | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<ImportValues>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      namespace: "",
      table: "",
      mode: "append",
      confirmTable: "",
      acknowledgeLossy: false,
    },
  });
  const mode = form.watch("mode");
  const lossy = inspect?.repairs.some((r) => r.lossy) ?? false;

  useEffect(() => {
    setInspect(null);
    setInspectError(null);
    setResult(null);
    setUploadError(null);
    form.setValue("acknowledgeLossy", false);
    if (file && !form.getValues("table")) {
      const stem = file.name
        .replace(/\.parquet$/i, "")
        .replace(/[^A-Za-z0-9_]/g, "_")
        .replace(/^(\d)/, "_$1");
      form.setValue("table", stem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const runInspect = async () => {
    if (!file) return;
    setInspecting(true);
    setInspectError(null);
    try {
      setInspect(await api.inspectParquet(file));
    } catch (cause) {
      setInspectError({
        message: errorMessage(cause),
        problems: cause instanceof ApiError ? cause.problems : [],
      });
    } finally {
      setInspecting(false);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    if (!file) return;
    if (lossy && !values.acknowledgeLossy) {
      form.setError("acknowledgeLossy", {
        message: "Acknowledge the lossy repair to continue",
      });
      return;
    }
    setUploading(true);
    setUploadError(null);
    setResult(null);
    try {
      const uploaded = await api.uploadParquet(
        values.namespace,
        values.table,
        file,
        values.mode,
      );
      setResult(uploaded);
      emitCatalogChange();
      toast.success(
        `${formatCount(uploaded.rows)} rows written to ${uploaded.namespace}.${uploaded.table}`,
      );
    } catch (cause) {
      setUploadError({
        message: errorMessage(cause),
        problems: cause instanceof ApiError ? cause.problems : [],
      });
    } finally {
      setUploading(false);
    }
  });

  return (
    <>
      <PageHeader
        title="Import data"
        description="Write a Parquet file into a new or existing table. Types Iceberg lacks are repaired and reported."
      />
      <form
        onSubmit={submit}
        className="grid gap-6 px-6 pb-8 lg:grid-cols-[24rem_1fr]"
      >
        <FieldGroup className="content-start">
          <Field>
            <FieldLabel htmlFor="parquet-file">Parquet file</FieldLabel>
            <input
              ref={fileInput}
              id="parquet-file"
              type="file"
              accept=".parquet,application/vnd.apache.parquet,application/octet-stream"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left text-sm hover:border-primary hover:bg-primary/5",
                file && "border-solid",
              )}
            >
              <FileUp className="size-4 shrink-0 text-primary" />
              {file ? (
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Choose a .parquet file
                </span>
              )}
            </button>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!file || inspecting}
                onClick={runInspect}
              >
                {inspecting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <FileSearch data-icon="inline-start" />
                )}
                Inspect file
              </Button>
            </div>
          </Field>

          <Controller
            control={form.control}
            name="namespace"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Namespace</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={namespaces.loading ? "Loading…" : "Choose"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(namespaces.data ?? []).map((ns) => (
                      <SelectItem key={ns} value={ns}>
                        {ns}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {namespaces.error && (
                  <FieldDescription className="text-destructive">
                    {namespaces.error}
                  </FieldDescription>
                )}
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="table"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="import-table">Table</FieldLabel>
                <Input
                  id="import-table"
                  {...field}
                  placeholder="nq_futures_mbo"
                  className="font-mono"
                  autoComplete="off"
                />
                <FieldDescription>
                  A missing table is created from the file&apos;s schema.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="mode"
            render={({ field }) => (
              <Field>
                <FieldLabel>Mode</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(["append", "overwrite"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => field.onChange(option)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm",
                        field.value === option
                          ? "border-primary bg-primary/5 text-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="block font-medium capitalize">
                        {option}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option === "append" ? "Add rows" : "Replace every row"}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
          />
          {mode === "overwrite" && (
            <Controller
              control={form.control}
              name="confirmTable"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirm-table">
                    Type the table name to replace all rows
                  </FieldLabel>
                  <Input
                    id="confirm-table"
                    {...field}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
          {lossy && (
            <Controller
              control={form.control}
              name="acknowledgeLossy"
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={fieldState.invalid}
                >
                  <Checkbox
                    id="ack-lossy"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="ack-lossy">
                      Accept the lossy repairs
                    </FieldLabel>
                    <FieldDescription>
                      Nanoseconds are truncated to microseconds.
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
          <div>
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              {mode === "append" ? "Append rows" : "Replace rows"}
            </Button>
            {uploading && (
              <p className="mt-2 text-xs text-muted-foreground">
                Streaming to the API. After a connection failure, check the
                table before retrying: the write may have completed.
              </p>
            )}
          </div>
          {uploadError && (
            <ErrorNotice
              title="Upload rejected"
              message={uploadError.message}
              problems={uploadError.problems}
            />
          )}
        </FieldGroup>

        <div className="flex flex-col gap-4">
          {result && (
            <Alert>
              <CheckCircle2 className="text-emerald-500" />
              <AlertTitle>
                {formatCount(result.rows)} rows{" "}
                {result.mode === "append" ? "appended to" : "written to"}{" "}
                <span className="font-mono">
                  {result.namespace}.{result.table}
                </span>
                {result.created && " (table created)"}
              </AlertTitle>
              <AlertDescription>
                <span>
                  Snapshot{" "}
                  <span className="font-mono">
                    {result.snapshot_id ?? "none"}
                  </span>
                  {result.repairs.length > 0 &&
                    ` · ${result.repairs.length} repair${result.repairs.length === 1 ? "" : "s"}`}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0"
                  asChild
                >
                  <Link href={tableHref(result.namespace, result.table)}>
                    Open table <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {inspectError && (
            <ErrorNotice
              title="The file cannot be imported"
              message={inspectError.message}
              problems={inspectError.problems}
            />
          )}
          {inspect ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Inspection</span>
                <span className="text-muted-foreground tabular">
                  {formatCount(inspect.rows)} rows · {inspect.columns.length}{" "}
                  columns
                </span>
                {inspect.repairs.length > 0 && (
                  <Badge variant={lossy ? "destructive" : "secondary"}>
                    {inspect.repairs.length} repair
                    {inspect.repairs.length === 1 ? "" : "s"}
                    {lossy ? ", lossy" : ""}
                  </Badge>
                )}
              </div>
              {inspect.repairs.length > 0 && (
                <RepairList repairs={inspect.repairs} />
              )}
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Column</TableHead>
                      <TableHead>Parquet type</TableHead>
                      <TableHead>Iceberg type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspect.columns.map((column) => (
                      <TableRow key={column.name}>
                        <TableCell className="font-mono">
                          {column.name}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {column.parquet_type}
                        </TableCell>
                        <TableCell className="font-mono">
                          {column.iceberg_type}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            (result?.repairs.length ?? 0) > 0 && (
              <RepairList repairs={result!.repairs} />
            )
          )}
          {!inspect && !result && !inspectError && (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Choose a file and inspect it to see its columns and the repairs an
              upload would apply. Uploading without inspecting works too; the
              result lists the repairs.
            </div>
          )}
        </div>
      </form>
    </>
  );
}

function RepairList({ repairs }: { repairs: Repair[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {repairs.map((repair) => (
        <li
          key={repair.column}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            repair.lossy && "border-destructive/40",
          )}
        >
          {repair.lossy ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="font-mono">{repair.column}</span>
            <span className="text-muted-foreground">
              {" "}
              {repair.from_type} → {repair.to_type}
            </span>
            <span className="block text-xs text-muted-foreground">
              {repair.reason}
            </span>
          </span>
          {repair.lossy && (
            <Badge variant="destructive" className="ml-auto">
              lossy
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
