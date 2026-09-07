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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ColumnFields } from "@/components/console/column-fields";
import { ErrorNotice } from "@/components/console/error-notice";
import { api, ApiError, errorMessage } from "@/lib/api";
import { emitCatalogChange } from "@/lib/events";
import {
  manageTableSchema,
  parseProperties,
  type ManageTableForm,
} from "@/lib/schemas";
import type { TableInfo } from "@/lib/types";

const propertiesText = (properties: Record<string, string>) =>
  Object.keys(properties).length ? JSON.stringify(properties, null, 2) : "";

export function ManageTableDialog({
  table,
  open,
  onOpenChange,
  onUpdated,
}: {
  table: TableInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: TableInfo) => void;
}) {
  const [error, setError] = useState<{
    message: string;
    problems: string[];
  } | null>(null);
  const form = useForm<ManageTableForm>({
    resolver: zodResolver(manageTableSchema),
    defaultValues: {
      rename_to: "",
      add_columns: [],
      properties: propertiesText(table.properties),
    },
  });

  useEffect(() => {
    if (open)
      form.reset({
        rename_to: "",
        add_columns: [],
        properties: propertiesText(table.properties),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table]);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const next = parseProperties(values.properties);
    const set_properties: Record<string, string> = {};
    for (const [k, v] of Object.entries(next))
      if (table.properties[k] !== v) set_properties[k] = v;
    const remove_properties = Object.keys(table.properties).filter(
      (k) => !(k in next),
    );
    const rename_to = values.rename_to.trim() || null;
    const add_columns = values.add_columns.map((c) => ({
      ...c,
      doc: c.doc?.trim() || null,
    }));
    if (
      !rename_to &&
      !add_columns.length &&
      !Object.keys(set_properties).length &&
      !remove_properties.length
    ) {
      onOpenChange(false);
      return;
    }
    try {
      const updated = await api.updateTable(table.namespace, table.name, {
        rename_to,
        set_properties,
        remove_properties,
        add_columns,
      });
      toast.success(
        rename_to
          ? `Renamed to ${updated.namespace}.${updated.name}`
          : `Table ${table.name} updated`,
      );
      emitCatalogChange();
      onOpenChange(false);
      onUpdated(updated);
    } catch (cause) {
      setError({
        message: errorMessage(cause),
        problems: cause instanceof ApiError ? cause.problems : [],
      });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setError(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Manage {table.name}</DialogTitle>
            <DialogDescription>
              Rename the table, add columns, or change its properties in one
              commit.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              control={form.control}
              name="rename_to"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="rename-to">Rename to</FieldLabel>
                  <Input
                    id="rename-to"
                    {...field}
                    placeholder={table.name}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <FieldDescription>
                    Leave empty to keep the name. The namespace stays the same.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field>
              <FieldLabel>Add columns</FieldLabel>
              <ColumnFields control={form.control} name="add_columns" />
            </Field>
            <Controller
              control={form.control}
              name="properties"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="manage-properties">
                    Properties
                  </FieldLabel>
                  <Textarea
                    id="manage-properties"
                    {...field}
                    rows={6}
                    placeholder="{}"
                    className="font-mono"
                  />
                  <FieldDescription>
                    The full set of properties. A key removed here is removed
                    from the table.
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
