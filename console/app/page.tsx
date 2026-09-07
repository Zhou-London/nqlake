"use client";

import Link from "next/link";
import { Activity, ArrowRight, FolderOpen, Layers, Table2 } from "lucide-react";
import {
  PageHeading,
  ErrorBanner,
  EmptyState,
  LoadingState,
  RefreshButton,
} from "@/components/shared";
import { TableList } from "@/components/table-list";
import { useLake } from "@/components/lake-provider";
import { number } from "@/lib/utils";

export default function Overview() {
  const {
    status,
    namespaces,
    tables,
    loading,
    error,
    statusError,
    updated,
    refresh,
  } = useLake();
  const available = !!updated;
  const totalRows = tables.reduce(
    (sum, table) => sum + (table.row_count || 0),
    0,
  );
  const healthy = status?.services.filter((service) => service.ok).length;
  const stats = [
    {
      label: "Tables",
      value: available ? number(tables.length) : "—",
      icon: Table2,
      note: "Apache Iceberg tables",
    },
    {
      label: "Namespaces",
      value: available ? number(namespaces.length) : "—",
      icon: FolderOpen,
      note: "Across your data catalog",
    },
    {
      label: "Total rows",
      value: available ? number(totalRows) : "—",
      icon: Layers,
      note: tables.some((table) => table.row_count == null)
        ? "Known row counts only"
        : "From current table snapshots",
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow=""
        title="Overview"
        description=""
      >
        <RefreshButton loading={loading} onClick={refresh} />
      </PageHeading>
      {(error || statusError) && (
        <ErrorBanner
          message={`${error || statusError}${updated ? " Showing previously loaded data." : ""}`}
        />
      )}
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel p-4 lg:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {stat.label}
              </span>
              <stat.icon
                size={16}
                strokeWidth={1.6}
                className="shrink-0 text-[#8795ab]"
              />
            </div>
            <div className="mb-4 mt-5 text-2xl font-medium leading-none tracking-tight sm:text-[29px] xl:text-[34px]">
              {loading && !available ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                stat.value
              )}
            </div>
            <p className="border-t pt-3 text-[10px] leading-4 text-muted-foreground">
              {stat.note}
            </p>
          </div>
        ))}
      </div>
      <section className="panel overflow-hidden">
        <div className="panel-title">
          <h2 className="text-sm font-medium">Recently updated tables</h2>
          <Link
            href="/catalog"
            className="flex shrink-0 items-center gap-1.5 text-xs text-primary"
          >
            View catalog <ArrowRight size={13} />
          </Link>
        </div>
        {loading && !available ? (
          <LoadingState />
        ) : tables.length ? (
          <TableList
            tables={[...tables]
              .sort((a, b) =>
                (b.snapshot_at || "").localeCompare(a.snapshot_at || ""),
              )
              .slice(0, 5)}
          />
        ) : (
          <EmptyState
            icon={Table2}
            title={error ? "Waiting for your data" : "No tables yet"}
            description={
              error
                ? "Connect the data service and refresh to load your catalog."
                : "Create a namespace in the catalog, then add a table or import a Parquet file."
            }
          />
        )}
        {updated && (
          <div className="border-t px-5 py-3 text-[10px] text-muted-foreground">
            Last synced at{" "}
            {updated.toLocaleTimeString("en-US", { hour12: false })}
          </div>
        )}
      </section>
    </>
  );
}
