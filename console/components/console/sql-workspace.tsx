"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Play, Square, Terminal } from "lucide-react";
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
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNotice } from "@/components/console/error-notice";
import { PageHeader } from "@/components/console/page-header";
import { ResultGrid } from "@/components/console/result-grid";
import { api, errorMessage, loadCatalog } from "@/lib/api";
import { useCatalogVersion } from "@/lib/events";
import { splitQualified, sqlPath } from "@/lib/format";
import { querySchema, type QueryForm } from "@/lib/schemas";
import type { Rows } from "@/lib/types";
import { useResource } from "@/lib/use-resource";

export function SqlWorkspace() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const params = useSearchParams();
  const version = useCatalogVersion();
  const catalog = useResource(loadCatalog, `catalog:${version}`);
  const tables = { ...catalog, data: catalog.data?.tables };
  const [result, setResult] = useState<Rows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const initial = params.get("table");
  const form = useForm<QueryForm>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      sql: initial
        ? `SELECT * FROM ${sqlPath(splitQualified(initial).namespace, splitQualified(initial).table)}`
        : "",
      limit: 1000,
    },
  });

  const run = form.handleSubmit(async ({ sql, limit }) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      setResult(await api.query(sql, limit, abort.signal));
      setElapsed(performance.now() - started);
    } catch (cause) {
      if (!abort.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  });

  useEffect(() => () => controller.current?.abort(), []);

  const insertTable = (qualified: string) => {
    const { namespace, table } = splitQualified(qualified);
    form.setValue("sql", `SELECT * FROM ${sqlPath(namespace, table)}`, {
      shouldDirty: true,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="SQL"
        description="One read-only statement, run by DuckDB over the catalog attached as lake."
      >
        <Select onValueChange={insertTable}>
          <SelectTrigger className="w-64" size="sm">
            <SelectValue
              placeholder={
                tables.loading ? "Loading tables…" : "Insert a table path"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(tables.data ?? []).map(({ namespace, table }) => (
              <SelectItem
                key={`${namespace}.${table}`}
                value={`${namespace}.${table}`}
                className="font-mono"
              >
                {namespace}.{table}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>
      <form onSubmit={run} className="flex flex-col gap-2 border-b px-6 pb-4">
        <Controller
          control={form.control}
          name="sql"
          render={({ field, fieldState }) => (
            <div>
              <Textarea
                {...field}
                rows={7}
                spellCheck={false}
                placeholder="SELECT count(*) FROM lake.raw.nq"
                className="resize-y font-mono text-sm"
                aria-invalid={fieldState.invalid}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void run();
                  }
                }}
              />
              <FieldError
                errors={[fieldState.error]}
                className="mt-1 text-xs"
              />
            </div>
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            Run
          </Button>
          {busy && (
            <Button
              type="button"
              variant="outline"
              onClick={() => controller.current?.abort()}
            >
              <Square data-icon="inline-start" /> Cancel
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>{" "}
            to run
          </span>
          <Controller
            control={form.control}
            name="limit"
            render={({ field, fieldState }) => (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Row limit</span>
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
                  min={100}
                  max={10_000}
                  step={100}
                  className="w-24 tabular"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} className="text-xs" />
              </div>
            )}
          />
          {elapsed !== null && result && !busy && (
            <span className="text-xs text-muted-foreground tabular">
              {(elapsed / 1000).toFixed(2)} s
            </span>
          )}
        </div>
      </form>
      {error && (
        <div className="px-6 pt-4">
          <ErrorNotice title="Query failed" message={error} />
        </div>
      )}
      {result ? (
        <ResultGrid
          result={result}
          exportName="query"
          className="min-h-96 flex-1"
        />
      ) : (
        !error && (
          <Empty className="m-6 flex-1 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Terminal />
              </EmptyMedia>
              <EmptyTitle>No result yet</EmptyTitle>
              <EmptyDescription>
                Tables are addressed as{" "}
                <span className="font-mono">
                  lake.&lt;namespace&gt;.&lt;table&gt;
                </span>
                . Only statements that return rows are accepted.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </div>
  );
}
