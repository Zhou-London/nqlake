import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PageHeading, ErrorPanel } from "./shared";
import { FieldError } from "./forms";
import {
  api,
  tablePath,
  errorMessage,
  type Inspection,
  type Upload,
} from "@/lib/api";
import { number } from "@/lib/utils";
const schema = z.object({
  namespace: z.string().min(1, "Select a namespace."),
  table: z.string().trim().min(1, "Enter a table name."),
  mode: z.enum(["append", "overwrite"]),
  create: z.boolean(),
});
export function ImportPage({
  namespaces,
  done,
}: {
  namespaces: string[];
  done: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [result, setResult] = useState<Upload | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      namespace: namespaces[0] || "",
      table: "",
      mode: "append",
      create: true,
    },
  });
  async function inspect(f?: File) {
    if (!f) return;
    setError("");
    setInspection(null);
    setResult(null);
    setFile(f);
    if (!f.name.toLowerCase().endsWith(".parquet")) {
      setError("Choose a file with the .parquet extension.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", f);
      setInspection(
        await api<Inspection>("/parquet/inspect", {
          method: "POST",
          body: data,
        }),
      );
      if (!form.getValues("table"))
        form.setValue(
          "table",
          f.name.replace(/\.parquet$/i, "").replace(/[^a-zA-Z0-9_]/g, "_"),
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const upload = async () => {
    if (!file || !inspection || busy) return;
    setConfirm(false);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const v = form.getValues();
      const data = new FormData();
      data.append("file", file);
      data.append("mode", v.mode);
      data.append("create", String(v.create));
      const r = await api<Upload>(
        tablePath(v.namespace, v.table) + "/parquet",
        { method: "POST", body: data },
      );
      setResult(r);
      setInspection(null);
      toast.success(`Imported ${number(r.rows)} rows`);
      done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Workspace / Ingestion"
        title="Import data"
        description="From Parquet to query-ready. Bring your files into the lakehouse."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <div className="panel p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-primary">
                1
              </span>
              <h2 className="text-sm font-semibold">Choose a Parquet file</h2>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".parquet"
              className="sr-only"
              aria-label="Select Parquet file"
              disabled={busy}
              onChange={(e) => void inspect(e.target.files?.[0])}
            />
            <button
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy) void inspect(e.dataTransfer.files[0]);
              }}
              className={`flex w-full flex-col items-center rounded-xl border-2 border-dashed px-5 py-10 transition-colors ${drag ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/40"}`}
            >
              <div className="mb-4 rounded-xl border bg-white p-3 text-primary shadow-xs">
                {busy ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <UploadCloud className="size-6" />
                )}
              </div>
              <p className="text-sm font-medium">
                {busy ? (
                  "Processing your file…"
                ) : (
                  <>
                    Drop a file here, or{" "}
                    <span className="text-primary">browse files</span>
                  </>
                )}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Apache Parquet files · Schema detected automatically
              </p>
            </button>
            {file && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
                <FileUp className="size-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{file.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB{" "}
                    {inspection &&
                      `· ${number(inspection.rows)} rows · ${inspection.columns.length} columns`}
                  </p>
                </div>
                {inspection && (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove file"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    setInspection(null);
                    setResult(null);
                    setError("");
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
          {error && <ErrorPanel error={error} />}
          <form
            className="panel p-6"
            onSubmit={form.handleSubmit((v) => {
              if (
                v.mode === "overwrite" ||
                inspection?.repairs.some((r) => r.lossy)
              )
                setConfirm(true);
              else void upload();
            })}
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-primary">
                2
              </span>
              <h2 className="text-sm font-semibold">Set your destination</h2>
            </div>
            <fieldset disabled={busy} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="import-ns">Namespace</label>
                  <select
                    id="import-ns"
                    className="w-full"
                    {...form.register("namespace")}
                  >
                    <option value="">Select a namespace</option>
                    {namespaces.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <FieldError
                    message={form.formState.errors.namespace?.message}
                  />
                </div>
                <div>
                  <label htmlFor="import-table">Table name</label>
                  <Input
                    id="import-table"
                    placeholder="e.g. market_events"
                    {...form.register("table")}
                  />
                  <FieldError message={form.formState.errors.table?.message} />
                </div>
              </div>
              <div>
                <label htmlFor="import-mode">Write mode</label>
                <select
                  id="import-mode"
                  className="w-full"
                  {...form.register("mode")}
                >
                  <option value="append">
                    Append — add rows to existing data
                  </option>
                  <option value="overwrite">
                    Overwrite — replace all existing data
                  </option>
                </select>
              </div>
              <label className="flex items-center gap-2 font-normal">
                <input
                  className="accent-blue-600"
                  type="checkbox"
                  {...form.register("create")}
                />
                Create the table if it doesn't exist
              </label>
              <div className="flex justify-end border-t pt-4">
                <Button disabled={!inspection || busy || !file}>
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <UploadCloud />
                  )}
                  Import data
                  <ArrowRight />
                </Button>
              </div>
            </fieldset>
          </form>
          {result && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-5" />
                Import complete
              </div>
              <p className="mt-2 text-sm">
                {number(result.rows)} rows{" "}
                {result.mode === "overwrite" ? "written" : "appended"} to{" "}
                {result.namespace}.{result.table}.
              </p>
              {result.repairs.map((r, i) => (
                <p className="mt-2 text-xs" key={i}>
                  {r.column}: {r.reason}
                  {r.lossy && " (precision reduced)"}
                </p>
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-5">
          <div className="panel p-5">
            <span className="pill mb-4">BUILT FOR YOUR LAKEHOUSE</span>
            <h3 className="text-sm font-semibold">
              A little less preparation.
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              We inspect your file before it reaches the lake. Review the schema
              and any conversions before you import.
            </p>
            <div className="mt-5 space-y-3">
              {[
                "Automatic schema detection",
                "Iceberg type compatibility",
                "Append or replace your data",
              ].map((s) => (
                <p key={s} className="flex items-center gap-2 text-xs">
                  <Check className="size-3.5 text-primary" />
                  {s}
                </p>
              ))}
            </div>
          </div>
          {inspection && (
            <div className="panel">
              <div className="border-b p-4 text-xs font-semibold">
                Detected schema{" "}
                <span className="ml-1 text-muted-foreground">
                  ({inspection.columns.length})
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {inspection.columns.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-2 border-b px-4 py-3 text-xs last:border-0"
                  >
                    <span className="truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="font-mono text-[10px] text-primary">
                      {c.iceberg_type}
                    </span>
                  </div>
                ))}
              </div>
              {inspection.repairs.length > 0 && (
                <div className="border-t bg-amber-50 p-4">
                  <h4 className="mb-2 text-xs font-semibold text-amber-800">
                    Type conversions
                  </h4>
                  {inspection.repairs.map((r, i) => (
                    <p
                      key={i}
                      className="mb-2 text-xs leading-5 text-amber-800"
                    >
                      <strong>{r.column}</strong>: {r.from_type} → {r.to_type}.{" "}
                      {r.reason}
                      {r.lossy && " Precision will be reduced."}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Confirm import
          </DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
            {form.getValues("mode") === "overwrite"
              ? "This import will replace every existing row in the destination table. "
              : ""}
            {inspection?.repairs.some((r) => r.lossy)
              ? "Some values will lose precision during type conversion. "
              : ""}
            Continue with this import?
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => void upload()}>Confirm import</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
