"use client";

import { useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ErrorNotice } from "@/components/console/error-notice";
import { api, errorMessage } from "@/lib/api";
import { emitCatalogChange } from "@/lib/events";
import { namespaceSchema, type NamespaceForm } from "@/lib/schemas";

export function CreateNamespaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (name: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<NamespaceForm>({
    resolver: zodResolver(namespaceSchema),
    defaultValues: { name: "" },
  });

  const submit = form.handleSubmit(async ({ name }) => {
    setError(null);
    try {
      await api.createNamespace(name);
      toast.success(`Namespace ${name} created`);
      emitCatalogChange();
      form.reset();
      onOpenChange(false);
      onCreated?.(name);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          form.reset();
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Create namespace</DialogTitle>
            <DialogDescription>
              A namespace groups tables. Nest levels with dots.
            </DialogDescription>
          </DialogHeader>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="ns-name">Name</FieldLabel>
                <Input
                  id="ns-name"
                  {...field}
                  placeholder="raw.futures"
                  className="font-mono"
                  autoFocus
                  autoComplete="off"
                />
                <FieldDescription>
                  Letters, digits, and underscores per level.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          {error && <ErrorNotice message={error} />}
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DropNamespaceDialog({
  namespace,
  onOpenChange,
  onDropped,
}: {
  namespace: string | null;
  onOpenChange: (open: boolean) => void;
  onDropped?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drop = async () => {
    if (!namespace) return;
    setBusy(true);
    setError(null);
    try {
      await api.dropNamespace(namespace);
      toast.success(`Namespace ${namespace} dropped`);
      emitCatalogChange();
      onOpenChange(false);
      onDropped?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={namespace !== null}
      onOpenChange={(v) => {
        if (!v) setError(null);
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Drop namespace {namespace}?</AlertDialogTitle>
          <AlertDialogDescription>
            Only an empty namespace can be dropped. Tables inside it stay
            untouched and the request fails.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorNotice message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void drop();
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            Drop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
