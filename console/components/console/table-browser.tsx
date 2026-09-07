"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Plus, RefreshCw, Search, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateTableDialog } from "@/components/console/create-table-dialog";
import { ErrorNotice } from "@/components/console/error-notice";
import { tableHref } from "@/components/console/nav";
import { loadCatalog } from "@/lib/api";
import { useCatalogVersion } from "@/lib/events";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** Two-pane table browser: the catalog tree on the left, the selected table on the right. */
export function TableBrowser({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <CatalogPane />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Consumes `?create=1` and `?namespace=x` from the shortcuts on other pages,
 * then clears the query. Kept apart from the pane because useSearchParams
 * needs a Suspense boundary, and the pane itself should hydrate with the page.
 */
function QueryIntent({
  onCreate,
  onNamespace,
}: {
  onCreate: () => void;
  onNamespace: (ns: string) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.get("create") === "1") onCreate();
    const ns = params.get("namespace");
    if (ns) onNamespace(ns);
    if (params.toString()) router.replace("/tables");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return null;
}

function CatalogPane() {
  const pathname = usePathname();
  const router = useRouter();
  const version = useCatalogVersion();
  const catalog = useResource(loadCatalog, `catalog:${version}`);
  const tables = { ...catalog, data: catalog.data?.tables };
  const [search, setSearch] = useState("");
  const [namespace, setNamespace] = useState<string>("all");
  const [creating, setCreating] = useState(false);

  const namespaces = catalog.data?.namespaces ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (tables.data ?? []).filter(
      (t) =>
        (namespace === "all" || t.namespace === namespace) &&
        (!needle || `${t.namespace}.${t.table}`.toLowerCase().includes(needle)),
    );
  }, [tables.data, namespace, search]);
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of visible)
      map.set(t.namespace, [...(map.get(t.namespace) ?? []), t.table]);
    return [...map.entries()];
  }, [visible]);

  return (
    <aside
      className={cn(
        "w-full shrink-0 flex-col border-r md:flex md:w-72",
        pathname === "/tables" ? "flex" : "hidden",
      )}
    >
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">Tables</span>
          {tables.data && (
            <span className="text-xs text-muted-foreground tabular">
              {tables.data.length}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={tables.reload}
            aria-label="Refresh"
          >
            <RefreshCw className={cn(tables.refreshing && "animate-spin")} />
          </Button>
          <Button size="xs" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" /> Create
          </Button>
        </div>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Filter by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={() => setSearch("")}
                aria-label="Clear"
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Select value={namespace} onValueChange={setNamespace}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Namespace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All namespaces</SelectItem>
            {namespaces.map((ns) => (
              <SelectItem key={ns} value={ns}>
                {ns}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tables.error && (
          <div className="p-1">
            <ErrorNotice title="Could not list tables" message={tables.error} />
          </div>
        )}
        {tables.loading ? (
          <div className="flex flex-col gap-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            {tables.data?.length
              ? "No table matches."
              : "No tables yet. Create one or import Parquet."}
          </p>
        ) : (
          groups.map(([ns, names]) => (
            <div key={ns} className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                <ChevronRight className="size-3" />
                <span className="font-mono">{ns}</span>
              </div>
              <ul>
                {names.map((table) => {
                  const href = tableHref(ns, table);
                  const active = pathname === href;
                  return (
                    <li key={table}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-7 items-center gap-2 rounded-md px-2 pl-5 font-mono text-sm",
                          active
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted",
                        )}
                      >
                        <Table2 className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{table}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      <Suspense>
        <QueryIntent
          onCreate={() => setCreating(true)}
          onNamespace={setNamespace}
        />
      </Suspense>
      <CreateTableDialog
        open={creating}
        onOpenChange={setCreating}
        namespaces={namespaces}
        initialNamespace={namespace === "all" ? undefined : namespace}
        onCreated={(ns, table) => router.push(tableHref(ns, table))}
      />
    </aside>
  );
}
