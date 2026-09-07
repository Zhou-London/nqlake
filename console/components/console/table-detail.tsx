"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Settings2, Terminal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataPreview } from "@/components/console/data-preview";
import { DropTableDialog } from "@/components/console/drop-table-dialog";
import { ErrorNotice } from "@/components/console/error-notice";
import { ManageTableDialog } from "@/components/console/manage-table-dialog";
import { tableHref } from "@/components/console/nav";
import { api } from "@/lib/api";
import { formatCount, formatDate, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

export function TableDetail({
  namespace,
  table,
}: {
  namespace: string;
  table: string;
}) {
  const router = useRouter();
  // Not keyed on the catalog version: a rename bumps it before the page
  // moves to the new name, and the old name would 404 in between.
  const info = useResource(
    () => api.table(namespace, table),
    `table:${namespace}.${table}`,
  );
  const [managing, setManaging] = useState(false);
  const [dropping, setDropping] = useState(false);

  if (info.error && !info.data) {
    return (
      <div className="p-6">
        <ErrorNotice
          title={`Could not load ${namespace}.${table}`}
          message={info.error}
        />
      </div>
    );
  }
  const data = info.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-sm text-muted-foreground">{namespace}.</span>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {table}
            </h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {data ? (
              <>
                <Badge variant="outline">v{data.format_version}</Badge>
                <span className="tabular">
                  {formatCount(data.row_count)} rows
                </span>
                <span>·</span>
                <span className="tabular">
                  {data.snapshot_count} snapshot
                  {data.snapshot_count === 1 ? "" : "s"}
                </span>
                {data.snapshot_at && (
                  <>
                    <span>·</span>
                    <span title={formatDate(data.snapshot_at)}>
                      last write {relativeTime(data.snapshot_at)}
                    </span>
                  </>
                )}
              </>
            ) : (
              <Skeleton className="h-4 w-48" />
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={info.reload}
            aria-label="Refresh"
          >
            <RefreshCw className={cn(info.refreshing && "animate-spin")} />
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/sql?table=${encodeURIComponent(`${namespace}.${table}`)}`}
            >
              <Terminal data-icon="inline-start" /> Query
            </Link>
          </Button>
          <Button onClick={() => setManaging(true)} disabled={!data}>
            <Settings2 data-icon="inline-start" /> Manage
          </Button>
        </div>
      </div>
      {info.error && (
        <div className="px-6 pt-4">
          <ErrorNotice
            title="Refresh failed; showing the last known state"
            message={info.error}
          />
        </div>
      )}

      <Tabs
        defaultValue="columns"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b px-6"
        >
          <TabsTrigger value="columns">Columns</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent
          value="columns"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          {data ? (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-right">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Doc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.columns.map((column) => (
                    <TableRow key={column.id}>
                      <TableCell className="text-right text-muted-foreground tabular">
                        {column.id}
                      </TableCell>
                      <TableCell className="font-mono">{column.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {column.type}
                      </TableCell>
                      <TableCell>
                        {column.required ? (
                          <Badge variant="secondary">required</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            optional
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {column.doc ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Skeleton className="h-40 rounded-lg" />
          )}
        </TabsContent>

        <TabsContent value="data" className="flex min-h-0 flex-1 flex-col">
          <DataPreview namespace={namespace} table={table} />
        </TabsContent>

        <TabsContent
          value="metadata"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          {data ? (
            <div className="flex flex-col gap-6">
              <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-[10rem_1fr]">
                <Item label="Location">
                  <span className="break-all font-mono">{data.location}</span>
                </Item>
                <Item label="Format version">
                  <span className="tabular">{data.format_version}</span>
                </Item>
                <Item label="Current snapshot">
                  <span className="font-mono tabular">
                    {data.snapshot_id ?? "none"}
                  </span>
                </Item>
                <Item label="Snapshot time">
                  {formatDate(data.snapshot_at)}
                </Item>
                <Item label="Rows">
                  <span className="tabular">{formatCount(data.row_count)}</span>
                </Item>
                <Item label="Snapshots">
                  <span className="tabular">{data.snapshot_count}</span>
                </Item>
                <Item label="Partition by">
                  {data.partition_by.length ? (
                    <span className="flex flex-wrap gap-1">
                      {data.partition_by.map((p) => (
                        <Badge key={p} variant="outline" className="font-mono">
                          {p}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">unpartitioned</span>
                  )}
                </Item>
              </dl>

              <section>
                <h2 className="mb-2 text-sm font-medium">Properties</h2>
                {Object.keys(data.properties).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No properties.
                  </p>
                ) : (
                  <div className="rounded-lg border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(data.properties)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, value]) => (
                            <TableRow key={key}>
                              <TableCell className="font-mono">{key}</TableCell>
                              <TableCell className="break-all font-mono text-muted-foreground">
                                {value}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-destructive/30 p-4">
                <h2 className="text-sm font-medium">Drop table</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Removes the table from the catalog. Files are kept unless you
                  choose to delete them.
                </p>
                <Button
                  variant="destructive"
                  className="mt-3"
                  onClick={() => setDropping(true)}
                >
                  <Trash2 data-icon="inline-start" /> Drop table
                </Button>
              </section>
            </div>
          ) : (
            <Skeleton className="h-40 rounded-lg" />
          )}
        </TabsContent>
      </Tabs>

      {data && (
        <ManageTableDialog
          table={data}
          open={managing}
          onOpenChange={setManaging}
          onUpdated={(updated) => {
            if (updated.name !== table)
              router.replace(tableHref(updated.namespace, updated.name));
            else info.reload();
          }}
        />
      )}
      <DropTableDialog
        namespace={namespace}
        table={table}
        open={dropping}
        onOpenChange={setDropping}
        onDropped={() => router.replace("/tables")}
      />
    </div>
  );
}

function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
