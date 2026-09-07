"use client";
import {
  Activity,
  CheckCircle2,
  Database,
  Layers,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useLake } from "@/components/lake-provider";
import { PageHeading, ErrorBanner, RefreshButton } from "@/components/shared";
import { cn } from "@/lib/utils";
const services = [
  {
    name: "lakekeeper",
    title: "Lakekeeper",
    description: "Iceberg REST Catalog",
    icon: Database,
  },
  {
    name: "minio",
    title: "MinIO",
    description: "S3-compatible object storage",
    icon: Layers,
  },
  {
    name: "postgres",
    title: "PostgreSQL",
    description: "Catalog metadata storage",
    icon: Server,
  },
  {
    name: "catalog",
    title: "Iceberg Catalog",
    description: "Namespaces and table catalog",
    icon: Database,
  },
  {
    name: "duckdb",
    title: "DuckDB",
    description: "Read-only SQL query engine",
    icon: TerminalSquare,
  },
];
export default function Services() {
  const { status, statusError, loading, refresh } = useLake();
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Services"
        description=""
      >
        <RefreshButton loading={loading} onClick={refresh} />
      </PageHeading>
      {statusError && <ErrorBanner message={statusError} onRetry={refresh} />}
      <div className="panel mb-6 flex items-center gap-4 p-6">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            status?.ok
              ? "bg-emerald-50 text-emerald-600"
              : "bg-muted text-muted-foreground",
          )}
        >
          {status?.ok ? (
            <CheckCircle2 size={25} strokeWidth={1.5} />
          ) : (
            <Activity size={25} strokeWidth={1.5} />
          )}
        </div>
        <div>
          <h2 className="text-base font-medium">
            {loading
              ? "Checking services"
              : status?.ok
                ? "All systems operational"
                : status
                  ? "Some services need attention"
                  : "Waiting for the data service"}
          </h2>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((item) => {
          const state = status?.services.find((s) => s.name === item.name);
          return (
            <section
              key={item.name}
              className="panel flex min-h-52 flex-col p-5"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/50 text-primary">
                  <item.icon size={20} strokeWidth={1.5} />
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
                    state?.ok
                      ? "bg-emerald-50 text-emerald-600"
                      : state
                        ? "bg-amber-50 text-amber-700"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      state?.ok
                        ? "bg-emerald-500"
                        : state
                          ? "bg-amber-500"
                          : "bg-slate-300",
                    )}
                  />
                  {loading
                    ? "Checking"
                    : state?.ok
                      ? "Operational"
                      : state
                        ? "Degraded"
                        : "Disconnected"}
                </span>
              </div>
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {item.description}
              </p>
              <p className="mt-4 break-words text-xs leading-5 text-muted-foreground">
                {state?.detail || "No response received yet"}
              </p>
              <div className="mt-auto pt-5">
                <p className="border-t pt-3 font-mono text-[10px] text-muted-foreground">
                  {state?.port
                    ? `127.0.0.1:${state.port}`
                    : item.name === "duckdb"
                      ? "In-process query engine"
                      : item.name === "catalog"
                        ? "REST catalog connection"
                        : "Local service"}
                </p>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
