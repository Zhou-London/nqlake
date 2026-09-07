"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Filter, Play } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ErrorNotice } from "@/components/console/error-notice";
import { ResultGrid } from "@/components/console/result-grid";
import { api, errorMessage } from "@/lib/api";
import { previewSchema, type PreviewForm } from "@/lib/schemas";
import type { Rows } from "@/lib/types";

/** Reads rows through the Iceberg scan with an optional filter expression. */
export function DataPreview({
  namespace,
  table,
}: {
  namespace: string;
  table: string;
}) {
  const [result, setResult] = useState<Rows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<PreviewForm>({
    resolver: zodResolver(previewSchema),
    defaultValues: { filter: "", limit: 500 },
  });
  const loaded = useRef(false);

  const run = form.handleSubmit(async ({ filter, limit }) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.rows(namespace, table, { filter, limit }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={run}
        className="flex flex-wrap items-start gap-2 border-b px-6 py-3"
      >
        <Controller
          control={form.control}
          name="filter"
          render={({ field, fieldState }) => (
            <div className="min-w-64 flex-1">
              <InputGroup>
                <InputGroupAddon>
                  <Filter />
                </InputGroupAddon>
                <InputGroupInput
                  {...field}
                  placeholder="Iceberg filter, e.g. price > 10 AND side = 'A'"
                  className="font-mono"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                />
              </InputGroup>
              <FieldError
                errors={[fieldState.error]}
                className="mt-1 text-xs"
              />
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="limit"
          render={({ field, fieldState }) => (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Limit</span>
                <Input
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={Number.isNaN(field.value) ? "" : field.value}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === "" ? NaN : e.target.valueAsNumber,
                    )
                  }
                  type="number"
                  min={1}
                  max={10_000}
                  className="w-24 tabular"
                  aria-invalid={fieldState.invalid}
                />
              </div>
              <FieldError
                errors={[fieldState.error]}
                className="mt-1 text-xs"
              />
            </div>
          )}
        />
        <Button type="submit" disabled={busy}>
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          Read rows
        </Button>
      </form>
      {error && (
        <div className="px-6 pt-4">
          <ErrorNotice title="Read failed" message={error} />
        </div>
      )}
      {result ? (
        <ResultGrid
          result={result}
          exportName={`${namespace}.${table}`}
          className="min-h-96 flex-1"
        />
      ) : (
        !error && (
          <Empty className="m-6 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {busy ? <Spinner /> : <Play />}
              </EmptyMedia>
              <EmptyTitle>
                {busy ? "Reading rows…" : "No rows read yet"}
              </EmptyTitle>
              <EmptyDescription>
                Up to the limit, filtered by the expression above.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </div>
  );
}
