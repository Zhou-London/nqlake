"use client";

import Link from "next/link";
import {
  ArrowRight,
  Database,
  FolderTree,
  Plus,
  Terminal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNotice } from "@/components/console/error-notice";
import { tableHref } from "@/components/console/nav";
import { loadCatalog } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export function CatalogSummary() {
  const catalog = useResource(loadCatalog, "catalog");
  const tables = { ...catalog, data: catalog.data?.tables };
  const namespaces = catalog.data?.namespaces ?? [];

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Catalog</h2>
          <Button variant="link" size="sm" className="ml-auto" asChild>
            <Link href="/tables">
              Browse tables <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        {tables.error && (
          <ErrorNotice
            title="Could not list the catalog"
            message={tables.error}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Stat
            icon={FolderTree}
            label="Namespaces"
            value={catalog.data ? namespaces.length : undefined}
          />
          <Stat
            icon={Database}
            label="Tables"
            value={tables.data ? tables.data.length : undefined}
          />
        </div>
        {tables.data && tables.data.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card">
            {tables.data.slice(0, 8).map(({ namespace, table }) => (
              <li key={`${namespace}.${table}`}>
                <Link
                  href={tableHref(namespace, table)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="font-mono text-muted-foreground">
                    {namespace}.
                  </span>
                  <span className="-ml-1.5 font-mono">{table}</span>
                  <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Shortcuts</h2>
        <div className="flex flex-col gap-1.5">
          <Shortcut
            href="/tables?create=1"
            icon={Plus}
            label="Create table"
            hint="Column specs"
          />
          <Shortcut
            href="/import"
            icon={Upload}
            label="Import Parquet"
            hint="New or existing table"
          />
          <Shortcut
            href="/sql"
            icon={Terminal}
            label="Run SQL"
            hint="Read-only, DuckDB"
          />
          <Shortcut
            href="/namespaces"
            icon={FolderTree}
            label="Namespaces"
            hint="Create or drop"
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-1 h-5 w-10" />
        ) : (
          <p className="text-lg font-semibold tabular">{value}</p>
        )}
      </div>
    </div>
  );
}

function Shortcut({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: typeof Database;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"
    >
      <Icon className="size-4 text-primary" />
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{hint}</span>
    </Link>
  );
}
