"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderTree, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorNotice } from "@/components/console/error-notice";
import {
  CreateNamespaceDialog,
  DropNamespaceDialog,
} from "@/components/console/namespace-dialogs";
import { PageHeader } from "@/components/console/page-header";
import { loadCatalog } from "@/lib/api";
import { useCatalogVersion } from "@/lib/events";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

export function NamespaceList() {
  const version = useCatalogVersion();
  const catalog = useResource(loadCatalog, `catalog:${version}`);
  const tables = { ...catalog, data: catalog.data?.tables };
  const [creating, setCreating] = useState(false);
  const [dropping, setDropping] = useState<string | null>(null);

  const namespaces = catalog.data?.namespaces;
  const countOf = (ns: string) =>
    tables.data?.filter((t) => t.namespace === ns).length ?? 0;

  return (
    <>
      <PageHeader
        title="Namespaces"
        description="Groups of tables in the catalog. Only an empty namespace can be dropped."
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={tables.reload}
          aria-label="Refresh"
        >
          <RefreshCw className={cn(tables.refreshing && "animate-spin")} />
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" /> Create namespace
        </Button>
      </PageHeader>
      <div className="px-6 pb-8">
        {tables.error && (
          <ErrorNotice
            title="Could not list namespaces"
            message={tables.error}
          />
        )}
        {tables.loading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : namespaces && namespaces.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderTree />
              </EmptyMedia>
              <EmptyTitle>No namespaces yet</EmptyTitle>
              <EmptyDescription>Create one to hold tables.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          namespaces && (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Namespace</TableHead>
                    <TableHead className="text-right">Tables</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {namespaces.map((ns) => {
                    const count = countOf(ns);
                    return (
                      <TableRow key={ns}>
                        <TableCell className="font-mono">
                          <Link
                            href={`/tables?namespace=${encodeURIComponent(ns)}`}
                            className="hover:text-primary hover:underline"
                          >
                            {ns}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={count > 0}
                            title={
                              count > 0
                                ? "Drop or move its tables first"
                                : "Drop namespace"
                            }
                            onClick={() => setDropping(ns)}
                          >
                            <Trash2 data-icon="inline-start" /> Drop
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </div>
      <CreateNamespaceDialog open={creating} onOpenChange={setCreating} />
      <DropNamespaceDialog
        namespace={dropping}
        onOpenChange={(v) => !v && setDropping(null)}
      />
    </>
  );
}
