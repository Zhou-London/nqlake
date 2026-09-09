"use client";
import { Card } from "@heroui/react";
import { FormSelect } from "@/components/ui/select";
import { useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@heroui/styles";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileCheck2,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, FormCheckbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PageHeading, ErrorBanner } from "@/components/shared";
import { useLake } from "@/components/lake-provider";
import {
  api,
  tablePath,
  tableHref,
  type Inspection,
  type UploadResult,
} from "@/lib/api";
import { number, cn } from "@/lib/utils";
const schema = z
  .object({
    namespace: z.string().min(1, "Select a destination namespace."),
    table: z
      .string()
      .trim()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Enter a valid table name."),
    mode: z.enum(["append", "overwrite"]),
    create: z.boolean(),
    confirm: z.boolean(),
  })
  .refine((data) => data.mode !== "overwrite" || data.confirm, {
    message: "Confirm before overwriting existing data.",
    path: ["confirm"],
  });
export default function Imports() {
  const { namespaces, refresh } = useLake();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [lossy, setLossy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      namespace: "",
      table: "",
      mode: "append",
      create: true,
      confirm: false,
    },
  });
  const mode = form.watch("mode");
  const submitting = form.formState.isSubmitting;
  function choose(selected?: File) {
    if (busy || submitting) return;
    setError("");
    setInspection(null);
    setResult(null);
    setLossy(false);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".parquet")) {
      setError("Select a .parquet file.");
      setFile(null);
      return;
    }
    setFile(selected);
    if (!form.getValues("table"))
      form.setValue(
        "table",
        selected.name.replace(/\.parquet$/i, "").replace(/[^a-zA-Z0-9_]/g, "_"),
      );
    if (!form.getValues("namespace") && namespaces[0])
      form.setValue("namespace", namespaces[0]);
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
  async function upload(values: z.infer<typeof schema>) {
    if (
      !file ||
      !inspection ||
      (inspection.repairs.some((r) => r.lossy) && !lossy)
    )
      return;
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", values.mode);
      body.append("create", String(values.create));
      const data = await api<UploadResult>(
        `${tablePath(values.namespace, values.table)}/parquet`,
        { method: "POST", body },
      );
      setResult(data);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Import data"
        description="Bring Parquet data into your lakehouse in three simple steps."
      />
      <div className="mb-7 grid grid-cols-3 gap-3 text-xs sm:max-w-lg">
        {["Choose file", "Inspect schema", "Import"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                i === 0 || (i === 1 && file) || (i === 2 && inspection)
                  ? "border-primary bg-primary text-white"
                  : "text-muted-foreground",
              )}
            >
              {result || (i === 0 && inspection) ? <Check size={12} /> : i + 1}
            </span>
            <span
              className={cn(
                i === 0 || (i === 1 && file) || (i === 2 && inspection)
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      {error && <ErrorBanner message={error} />}
      {result ? (
        <Card
          render={(props) => <section {...props} />}
          className="panel mx-auto max-w-2xl p-10 text-center"
        >
          <CheckCircle2
            className="mx-auto mb-5 size-12 text-emerald-500"
            strokeWidth={1.5}
          />
          <h2 className="text-xl font-medium">Import complete</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {number(result.rows)} rows{" "}
            {result.mode === "overwrite" ? "overwritten in" : "appended to"}{" "}
            {result.namespace}.{result.table}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Snapshot · {result.snapshot_id ?? "—"}
          </p>
          {result.repairs.length > 0 && (
            <div className="mt-5 rounded-lg bg-surface-secondary p-4 text-left text-xs">
              <p className="mb-2 font-medium">
                {result.repairs.length} type conversions applied
              </p>
              {result.repairs.map((r, i) => (
                <p key={i} className="py-1 text-muted-foreground">
                  {r.column}: {r.from_type} → {r.to_type}
                  {r.lossy ? " (precision truncated)" : ""}
                </p>
              ))}
            </div>
          )}
          <div className="mt-7 flex justify-center gap-3">
            <Button
              variant="tertiary"
              onPress={() => {
                setResult(null);
                setFile(null);
                setInspection(null);
                setLossy(false);
                form.reset();
              }}
            >
              Import another file
            </Button>

            <Link
              href={tableHref(result.namespace, result.table)}
              className={buttonVariants({
                variant: "primary",
                className: "gap-2 text-xs",
              })}
            >
              View table
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_310px]">
          <div className="min-w-0 space-y-5">
            <Card
              render={(props) => <section {...props} />}
              className="panel p-5"
            >
              <h2 className="mb-4 text-sm font-medium">Source file</h2>
              <input
                ref={input}
                type="file"
                accept=".parquet"
                className="sr-only"
                aria-label="Choose a Parquet file"
                disabled={busy || submitting}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy || submitting}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  choose(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex min-h-52 w-full flex-col items-center justify-center rounded-lg border border-dashed px-5 py-7 transition-colors",
                  dragging
                    ? "border-primary bg-blue-50"
                    : "border-[#cbd6e7] bg-[#fafcff] hover:border-primary hover:bg-blue-50/40",
                )}
              >
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-blue-100 bg-white text-primary">
                  <FileUp size={24} strokeWidth={1.5} />
                </div>
                <p className="max-w-full truncate text-sm font-medium">
                  {file ? file.name : "Choose a file or drop it here"}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace`
                    : "Parquet files only · One file at a time"}
                </p>
              </button>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="tertiary"
                  isDisabled={!file || busy || submitting}
                  onPress={inspect}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileCheck2 className="size-3.5" />
                  )}
                  {busy ? "Inspecting…" : "Inspect file"}
                </Button>
              </div>
            </Card>
            {inspection && (
              <Card
                render={(props) => <section {...props} />}
                className="panel overflow-hidden"
              >
                <div className="panel-title">
                  <h2 className="text-sm font-medium">Schema inspection</h2>
                  <span className="text-[11px] text-muted-foreground">
                    {number(inspection.rows)} rows · {inspection.columns.length}{" "}
                    columns
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Columns</th>
                        <th>Parquet type</th>
                        <th>Iceberg type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.columns.map((c) => (
                        <tr key={c.name}>
                          <td className="font-mono">{c.name}</td>
                          <td className="font-mono text-muted-foreground">
                            {c.parquet_type}
                          </td>
                          <td className="font-mono text-primary">
                            {c.iceberg_type}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t p-4">
                  {inspection.repairs.length ? (
                    <div className="space-y-2">
                      {inspection.repairs.map((r, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded-md p-3 text-xs leading-5",
                            r.lossy
                              ? "bg-amber-50 text-amber-800"
                              : "bg-blue-50 text-blue-800",
                          )}
                        >
                          <span className="font-medium">{r.column}</span> ·{" "}
                          {r.from_type} → {r.to_type}
                          <p className="mt-1">
                            {r.reason}
                            {r.lossy && " · This conversion loses precision"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-emerald-600">
                      <CheckCircle2 size={14} />
                      All columns are compatible. No conversions needed.
                    </p>
                  )}
                  {inspection.repairs.some((r) => r.lossy) && (
                    <Checkbox
                      className="mt-4"
                      isSelected={lossy}
                      onChange={setLossy}
                      isDisabled={submitting}
                    >
                      I understand the precision loss and approve these
                      conversions.
                    </Checkbox>
                  )}
                </div>
              </Card>
            )}
          </div>
          <form onSubmit={form.handleSubmit(upload)} className="panel p-5">
            <h2 className="mb-5 text-sm font-medium">Import Settings</h2>
            <fieldset disabled={submitting} className="space-y-5">
              <div>
                <label htmlFor="import-ns" className="field-label">
                  Namespace
                </label>
                <FormSelect
                  control={form.control}
                  name="namespace"
                  id="import-ns"
                  label="Namespace"
                  placeholder="Select a namespace"
                  isDisabled={submitting}
                  options={namespaces.map((ns) => ({ value: ns, label: ns }))}
                />
                <p className="field-error">
                  {form.formState.errors.namespace?.message}
                </p>
                {!namespaces.length && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Connect the service and create a namespace in the catalog.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="import-table" className="field-label">
                  Destination table
                </label>
                <Input
                  id="import-table"
                  placeholder="e.g. market_events"
                  {...form.register("table")}
                />
                <p className="field-error">
                  {form.formState.errors.table?.message}
                </p>
              </div>
              <div>
                <label htmlFor="import-mode" className="field-label">
                  Write mode
                </label>
                <FormSelect
                  control={form.control}
                  name="mode"
                  id="import-mode"
                  label="Write mode"
                  isDisabled={submitting}
                  options={[
                    { value: "append", label: "Append data" },
                    { value: "overwrite", label: "Overwrite all data" },
                  ]}
                />
              </div>
              <FormCheckbox
                control={form.control}
                name="create"
                isDisabled={submitting}
              >
                Create if not exist
              </FormCheckbox>
              {mode === "overwrite" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <FormCheckbox
                    control={form.control}
                    name="confirm"
                    isDisabled={submitting}
                  >
                    I confirm replacing all rows in the destination table
                  </FormCheckbox>
                  <p className="field-error">
                    {form.formState.errors.confirm?.message}
                  </p>
                </div>
              )}
            </fieldset>
            <Button
              type="submit"
              className="mt-6 w-full"
              isDisabled={
                !inspection ||
                busy ||
                submitting ||
                (inspection.repairs.some((r) => r.lossy) && !lossy)
              }
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {submitting ? "Importing…" : "Import file"}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
