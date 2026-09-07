"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Spinner } from "@/components/ui/spinner";
import { ErrorNotice } from "@/components/console/error-notice";
import { api, errorMessage } from "@/lib/api";
import { emitCatalogChange } from "@/lib/events";
import { confirmNameSchema } from "@/lib/schemas";

export function DropTableDialog({
  namespace,
  table,
  open,
  onOpenChange,
  onDropped,
}: {
  namespace: string;
  table: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDropped: () => void;
}) {
  const schema = confirmNameSchema(table);
  type Form = z.infer<typeof schema>;
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", purge: false },
  });

  const submit = form.handleSubmit(async ({ purge }) => {
    setError(null);
    try {
      await api.dropTable(namespace, table, purge);
      toast.success(
        `Table ${namespace}.${table} dropped${purge ? " and its files deleted" : ""}`,
      );
      emitCatalogChange();
      onOpenChange(false);
      onDropped();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          form.reset();
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <form onSubmit={submit} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Drop {namespace}.{table}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The table leaves the catalog. Its data and metadata files stay in
              storage unless you choose to delete them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="confirm-name">
                    Type the table name to confirm
                  </FieldLabel>
                  <Input
                    id="confirm-name"
                    {...field}
                    placeholder={table}
                    className="font-mono"
                    autoComplete="off"
                    autoFocus
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="purge"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="purge"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="purge">
                      Permanently delete the stored files
                    </FieldLabel>
                    <FieldDescription>
                      Cannot be undone. Leave off to keep the files for
                      recovery.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
          {error && <ErrorNotice message={error} />}
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Drop table
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
