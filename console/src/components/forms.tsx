import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ErrorPanel } from "./shared";
import {
  api,
  json,
  nsPath,
  tablePath,
  errorMessage,
  type LakeTable,
} from "@/lib/api";
const identifier = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    "Use letters, numbers, and underscores. Start with a letter or underscore.",
  );
const nsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "A name is required.")
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/,
      "Use dot-separated names, such as raw.market_data.",
    ),
});
const tableSchema = z.object({
  namespace: z.string().min(1, "Choose a namespace."),
  name: identifier,
  partition: z.string(),
  columns: z
    .array(
      z.object({
        name: identifier,
        type: z.string().min(1),
        required: z.boolean(),
      }),
    )
    .min(1, "Add at least one column.")
    .refine(
      (cols) => new Set(cols.map((c) => c.name)).size === cols.length,
      "Column names must be unique.",
    ),
});
export type Modal =
  | { kind: "namespace" }
  | { kind: "table"; namespace?: string }
  | { kind: "rename"; table: LakeTable }
  | { kind: "append"; table: LakeTable }
  | { kind: "delete-table"; table: LakeTable }
  | { kind: "delete-namespace"; namespace: string }
  | { kind: "delete-rows"; table: LakeTable }
  | null;
export function FormModal({
  modal,
  close,
  namespaces,
  done,
}: {
  modal: Modal;
  close: () => void;
  namespaces: string[];
  done: () => void;
}) {
  return (
    <Dialog
      open={!!modal}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        {modal && (
          <FormBody
            key={modal.kind}
            modal={modal}
            namespaces={namespaces}
            close={close}
            done={done}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function FormBody({
  modal,
  namespaces,
  close,
  done,
}: {
  modal: NonNullable<Modal>;
  namespaces: string[];
  close: () => void;
  done: () => void;
}) {
  const nsForm = useForm<z.infer<typeof nsSchema>>({
    resolver: zodResolver(nsSchema),
    defaultValues: { name: "" },
  });
  const tableForm = useForm<z.infer<typeof tableSchema>>({
    resolver: zodResolver(tableSchema),
    defaultValues: {
      namespace:
        modal.kind === "table" ? modal.namespace || namespaces[0] || "" : "",
      name: "",
      partition: "",
      columns: [{ name: "id", type: "long", required: true }],
    },
  });
  const fields = useFieldArray({ control: tableForm.control, name: "columns" });
  const genericSchema = z.object({
    value: z.string().trim().min(1, "This field is required."),
  });
  const form = useForm<z.infer<typeof genericSchema>>({
    resolver: zodResolver(genericSchema),
    defaultValues: {
      value:
        modal.kind === "rename"
          ? modal.table.name
          : modal.kind === "append"
            ? "[\n  {}\n]"
            : "",
    },
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const execute = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      toast.success("Changes saved successfully");
      done();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const titles = {
    namespace: "Create namespace",
    table: "Create table",
    rename: "Rename table",
    append: "Append rows",
    "delete-table": "Delete table",
    "delete-namespace": "Delete namespace",
    "delete-rows": "Delete matching rows",
  };
  const descriptions = {
    namespace:
      "Give your tables a place to live. Use dots for nested namespaces.",
    table: "Define a schema for your new Iceberg table.",
    rename: "Update the name of this table in the catalog.",
    append: "Add records as a JSON array. Values must match the table schema.",
    "delete-table":
      "Remove this table from the catalog. Stored files will be retained.",
    "delete-namespace": "Only empty namespaces can be deleted.",
    "delete-rows":
      "Permanently delete rows that match an Iceberg filter. The filter true deletes every row.",
  };
  const submitGeneric = form.handleSubmit(({ value }) =>
    execute(async () => {
      if (modal.kind === "rename") {
        identifier.parse(value);
        await api(
          tablePath(modal.table.namespace, modal.table.name),
          json("PATCH", { rename_to: value }),
        );
      }
      if (modal.kind === "append") {
        let rows: unknown;
        try {
          rows = JSON.parse(value);
        } catch {
          throw new Error("Enter a valid JSON array.");
        }
        if (
          !Array.isArray(rows) ||
          !rows.length ||
          rows.some((r) => !r || Array.isArray(r) || typeof r !== "object")
        )
          throw new Error("Enter a non-empty array of row objects.");
        await api(
          tablePath(modal.table.namespace, modal.table.name) + "/rows",
          json("POST", { rows }),
        );
      }
      if (modal.kind === "delete-table" || modal.kind === "delete-namespace") {
        const name =
          modal.kind === "delete-table" ? modal.table.name : modal.namespace;
        if (value !== name)
          throw new Error(`Type "${name}" exactly to confirm.`);
        await api(
          modal.kind === "delete-table"
            ? tablePath(modal.table.namespace, name)
            : nsPath(name),
          { method: "DELETE" },
        );
      }
      if (modal.kind === "delete-rows")
        await api(
          tablePath(modal.table.namespace, modal.table.name) +
            "/rows?filter=" +
            encodeURIComponent(value),
          { method: "DELETE" },
        );
    }),
  );
  return (
    <>
      <DialogTitle className="pr-7 text-lg font-semibold tracking-tight">
        {titles[modal.kind]}
      </DialogTitle>
      <DialogDescription className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
        {descriptions[modal.kind]}
      </DialogDescription>
      {error && <ErrorPanel error={error} />}
      <form
        onSubmit={
          modal.kind === "namespace"
            ? nsForm.handleSubmit((v) =>
                execute(() => api("/namespaces", json("POST", v))),
              )
            : modal.kind === "table"
              ? tableForm.handleSubmit((v) =>
                  execute(() =>
                    api(
                      `${nsPath(v.namespace)}/tables`,
                      json("POST", {
                        name: v.name,
                        columns: v.columns,
                        partition_by: v.partition
                          .split(";")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      }),
                    ),
                  ),
                )
              : submitGeneric
        }
        className="space-y-5"
      >
        {modal.kind === "namespace" ? (
          <div>
            <label htmlFor="namespace-name">Namespace name</label>
            <Input
              id="namespace-name"
              placeholder="e.g. analytics"
              {...nsForm.register("name")}
            />
            <FieldError message={nsForm.formState.errors.name?.message} />
          </div>
        ) : modal.kind === "table" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="table-namespace">Namespace</label>
                <select
                  id="table-namespace"
                  className="w-full"
                  {...tableForm.register("namespace")}
                >
                  <option value="" disabled>
                    Select namespace
                  </option>
                  {namespaces.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <FieldError
                  message={tableForm.formState.errors.namespace?.message}
                />
              </div>
              <div>
                <label htmlFor="table-name">Table name</label>
                <Input
                  id="table-name"
                  placeholder="e.g. events"
                  {...tableForm.register("name")}
                />
                <FieldError
                  message={tableForm.formState.errors.name?.message}
                />
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="mb-0">Columns</label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    fields.append({ name: "", type: "string", required: false })
                  }
                >
                  <Plus />
                  Add column
                </Button>
              </div>
              <div className="space-y-3">
                {fields.fields.map((f, i) => (
                  <div key={f.id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex">
                      <Input
                        className="col-span-3 sm:min-w-0"
                        aria-label={`Column ${i + 1} name`}
                        placeholder="Column name"
                        {...tableForm.register(`columns.${i}.name`)}
                      />
                      <select
                        aria-label={`Column ${i + 1} type`}
                        className="w-full shrink-0 sm:w-32"
                        {...tableForm.register(`columns.${i}.type`)}
                      >
                        {[
                          "long",
                          "int",
                          "string",
                          "double",
                          "float",
                          "boolean",
                          "date",
                          "time",
                          "timestamp",
                          "timestamptz",
                          "uuid",
                          "binary",
                          "decimal(20,0)",
                          "decimal(18,2)",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <label className="mb-0 flex items-center gap-1 text-[10px]">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          {...tableForm.register(`columns.${i}.required`)}
                        />
                        Required
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={fields.fields.length === 1}
                        aria-label={`Remove column ${i + 1}`}
                        onClick={() => fields.remove(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <FieldError
                      message={
                        tableForm.formState.errors.columns?.[i]?.name?.message
                      }
                    />
                  </div>
                ))}
              </div>
              <FieldError
                message={
                  tableForm.formState.errors.columns?.root?.message ||
                  tableForm.formState.errors.columns?.message
                }
              />
            </div>
            <div>
              <label htmlFor="partition">
                Partition by{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Input
                id="partition"
                placeholder="day(created_at); bucket[16](id)"
                {...tableForm.register("partition")}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Separate partition expressions with semicolons.
              </p>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="form-value">
              {modal.kind === "rename"
                ? "New table name"
                : modal.kind === "append"
                  ? "JSON rows"
                  : modal.kind === "delete-rows"
                    ? "Row filter"
                    : `Type "${modal.kind === "delete-table" ? modal.table.name : modal.kind === "delete-namespace" ? modal.namespace : ""}" to confirm`}
            </label>
            {modal.kind === "append" ? (
              <Textarea
                id="form-value"
                className="min-h-52 font-mono text-xs"
                spellCheck={false}
                {...form.register("value")}
              />
            ) : (
              <Input
                id="form-value"
                placeholder={
                  modal.kind === "delete-rows" ? "price < 0" : undefined
                }
                {...form.register("value")}
              />
            )}
            <FieldError message={form.formState.errors.value?.message} />
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            disabled={busy}
            variant={
              modal.kind.startsWith("delete") ? "destructive" : "default"
            }
          >
            {busy && <Loader2 className="animate-spin" />}
            {modal.kind.startsWith("delete")
              ? "Confirm deletion"
              : modal.kind === "append"
                ? "Append rows"
                : modal.kind === "rename"
                  ? "Save changes"
                  : "Create"}
          </Button>
        </div>
      </form>
    </>
  );
}
export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  ) : null;
}
