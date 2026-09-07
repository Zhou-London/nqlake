"use client";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useLake } from "@/components/lake-provider";

const identifier = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    "Use letters, numbers, and underscores. Start with a letter or underscore.",
  );
const namespaceSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/,
      "Enter a valid name, such as raw or raw.events.",
    ),
});
const tableSchema = z.object({
  namespace: z.string().min(1, "Select a namespace."),
  name: identifier,
  columns: z
    .array(
      z.object({
        name: identifier,
        type: z.string().min(1),
        required: z.boolean(),
      }),
    )
    .min(1)
    .refine(
      (cols) => new Set(cols.map((c) => c.name)).size === cols.length,
      "Column names must be unique.",
    ),
});
export function NewNamespaceButton({
  variant = "outline",
}: {
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  const { refresh } = useLake();
  const form = useForm<z.infer<typeof namespaceSchema>>({
    resolver: zodResolver(namespaceSchema),
    defaultValues: { name: "" },
  });
  async function submit(values: z.infer<typeof namespaceSchema>) {
    try {
      await api("/namespaces", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast.success("Namespace created.");
      setOpen(false);
      form.reset();
      await refresh();
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  }
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        New namespace
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!form.formState.isSubmitting) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New namespace</DialogTitle>
            <DialogDescription>
              Group tables by source or domain. Use dots for nested namespaces.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
            <div>
              <label htmlFor="namespace-name" className="field-label">
                Namespace name
              </label>
              <Input
                id="namespace-name"
                placeholder="e.g. raw or analytics"
                {...form.register("name")}
                aria-invalid={!!form.formState.errors.name}
              />
              <p className="field-error">
                {form.formState.errors.name?.message}
              </p>
            </div>
            {form.formState.errors.root && (
              <p role="alert" className="field-error">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={form.formState.isSubmitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                Create namespace
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function NewTableButton({ namespace }: { namespace?: string }) {
  const [open, setOpen] = useState(false);
  const { namespaces, refresh } = useLake();
  const form = useForm<z.infer<typeof tableSchema>>({
    resolver: zodResolver(tableSchema),
    defaultValues: {
      namespace: namespace || "",
      name: "",
      columns: [{ name: "id", type: "long", required: true }],
    },
  });
  const fields = useFieldArray({ control: form.control, name: "columns" });
  async function submit(values: z.infer<typeof tableSchema>) {
    try {
      await api(`/namespaces/${encodeURIComponent(values.namespace)}/tables`, {
        method: "POST",
        body: JSON.stringify({ name: values.name, columns: values.columns }),
      });
      toast.success("Table created.");
      setOpen(false);
      form.reset();
      await refresh();
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  }
  return (
    <>
      <Button
        disabled={!namespaces.length}
        onClick={() => {
          form.setValue("namespace", namespace || namespaces[0] || "");
          setOpen(true);
        }}
      >
        <Plus className="size-3.5" />
        New table
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!form.formState.isSubmitting) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New table</DialogTitle>
            <DialogDescription>
              Define columns to create an Apache Iceberg v2 table.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="table-namespace" className="field-label">
                  Namespace
                </label>
                <select
                  id="table-namespace"
                  className="native-select w-full"
                  {...form.register("namespace")}
                >
                  {namespaces.map((ns) => (
                    <option key={ns}>{ns}</option>
                  ))}
                </select>
                <p className="field-error">
                  {form.formState.errors.namespace?.message}
                </p>
              </div>
              <div>
                <label htmlFor="table-name" className="field-label">
                  Table name
                </label>
                <Input
                  id="table-name"
                  placeholder="e.g. events"
                  {...form.register("name")}
                />
                <p className="field-error">
                  {form.formState.errors.name?.message}
                </p>
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-medium">Columns</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    fields.append({ name: "", type: "string", required: false })
                  }
                >
                  <Plus className="size-3" />
                  Add column
                </Button>
              </div>
              <div className="space-y-3">
                {fields.fields.map((field, i) => (
                  <div key={field.id}>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Column ${i + 1} name`}
                        placeholder="Column name"
                        {...form.register(`columns.${i}.name`)}
                        className="min-w-0 flex-1"
                      />
                      <select
                        aria-label={`Column ${i + 1} type`}
                        className="native-select w-28"
                        {...form.register(`columns.${i}.type`)}
                      >
                        {[
                          "string",
                          "long",
                          "int",
                          "double",
                          "float",
                          "boolean",
                          "date",
                          "timestamp",
                          "timestamptz",
                          "uuid",
                          "binary",
                          "decimal(20,0)",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 whitespace-nowrap text-[11px]">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          {...form.register(`columns.${i}.required`)}
                        />
                        Required
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove column ${i + 1}`}
                        disabled={fields.fields.length === 1}
                        onClick={() => fields.remove(i)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <p className="field-error">
                      {form.formState.errors.columns?.[i]?.name?.message}
                    </p>
                  </div>
                ))}
              </div>
              <p className="field-error">
                {form.formState.errors.columns?.root?.message ||
                  form.formState.errors.columns?.message}
              </p>
            </div>
            {form.formState.errors.root && (
              <p role="alert" className="field-error">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={form.formState.isSubmitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                Create table
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
