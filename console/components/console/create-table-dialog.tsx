"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
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
import { Textarea } from "@/components/ui/textarea";
import { ColumnFields } from "@/components/console/column-fields";
import { ErrorNotice } from "@/components/console/error-notice";
import { api, ApiError, errorMessage } from "@/lib/api";
import { emitCatalogChange } from "@/lib/events";
import {
  createTableSchema,
  parseProperties,
  type CreateTableForm,
} from "@/lib/schemas";

export function CreateTableDialog({
  open,
  onOpenChange,
  namespaces,
  initialNamespace,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespaces: string[];
  initialNamespace?: string;
  onCreated?: (namespace: string, table: string) => void;
}) {
  const [error, setError] = useState<{
    message: string;
    problems: string[];
  } | null>(null);
  const form = useForm<CreateTableForm>({
    resolver: zodResolver(createTableSchema),
    defaultValues: {
      namespace: initialNamespace ?? "",
      name: "",
      columns: [{ name: "", type: "", required: false, doc: "" }],
      partition_by: "",
      properties: "",
    },
  });

  useEffect(() => {
    if (open && initialNamespace) form.setValue("namespace", initialNamespace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialNamespace]);

  const close = (v: boolean) => {
    if (!v) {
      form.reset();
      setError(null);
    }
    onOpenChange(v);
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const table = await api.createTable(values.namespace, {
        name: values.name,
        columns: values.columns.map((c) => ({
          ...c,
          doc: c.doc?.trim() || null,
        })),
        partition_by: values.partition_by
          ? values.partition_by
              .split(",")
              .map((e) => e.trim())
              .filter(Boolean)
          : [],
        properties: parseProperties(values.properties),
      });
      toast.success(`Table ${table.namespace}.${table.name} created`);
      emitCatalogChange();
      close(false);
      onCreated?.(table.namespace, table.name);
    } catch (cause) {
      setError({
        message: errorMessage(cause),
        problems: cause instanceof ApiError ? cause.problems : [],
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Create table</DialogTitle>
            <DialogDescription>
              An empty Iceberg v2 table from column specs.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
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
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {namespaces.map((ns) => (
                          <SelectItem key={ns} value={ns}>
                            {ns}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="table-name">Table name</FieldLabel>
                    <Input
                      id="table-name"
                      {...field}
                      placeholder="nq_futures_mbo"
                      className="font-mono"
                      autoComplete="off"
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Field
              data-invalid={Boolean(
                form.formState.errors.columns?.root ??
                form.formState.errors.columns?.message,
              )}
            >
              <FieldLabel>Columns</FieldLabel>
              <ColumnFields
                control={form.control}
                name="columns"
                emptyHint="A table needs at least one column."
              />
              <FieldError
                errors={[
                  form.formState.errors.columns?.root,
                  form.formState.errors.columns as { message?: string },
                ]}
              />
            </Field>
            <Controller
              control={form.control}
              name="partition_by"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="partition-by">Partition by</FieldLabel>
                  <Input
                    id="partition-by"
                    {...field}
                    placeholder="symbol, day(ts_event)"
                    className="font-mono"
                    autoComplete="off"
                  />
                  <FieldDescription>
                    Comma-separated: a column, or a transform such as day(ts) or
                    bucket[16](id).
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="properties"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="properties">Properties</FieldLabel>
                  <Textarea
                    id="properties"
                    {...field}
                    rows={3}
                    placeholder='{"owner": "desk"}'
                    className="font-mono"
                  />
                  <FieldDescription>
                    Optional JSON object of string values.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {error && (
            <ErrorNotice message={error.message} problems={error.problems} />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Create table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
