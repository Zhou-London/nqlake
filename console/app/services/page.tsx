"use client";
import { Card, Chip } from "@heroui/react";
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
        description="Monitor the services that power your local lakehouse."
      >
        <RefreshButton loading={loading} onClick={refresh} />
      </PageHeading>
      {statusError && <ErrorBanner message={statusError} onRetry={refresh} />}
      <Card className="panel mb-6 flex flex-row items-center gap-4 p-6">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            status?.ok
              ? "bg-emerald-50 text-emerald-600"
              : "bg-surface-secondary text-muted-foreground",
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
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((item) => {
          const state = status?.services.find((s) => s.name === item.name);
          return (
            <Card
              render={(props) => <section {...props} />}
              key={item.name}
              className="panel flex min-h-52 flex-col p-5"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg border bg-surface-secondary/50 text-primary">
                  <item.icon size={20} strokeWidth={1.5} />
                </div>
                <Chip
                  size="sm"
                  variant="soft"
                  color={
                    loading || !state
                      ? "default"
                      : state.ok
                        ? "success"
                        : "warning"
                  }
                >
                  <span
                    className={cn(
                      "mr-1.5 size-1.5 rounded-full",
                      loading || !state
                        ? "bg-slate-400"
                        : state.ok
                          ? "bg-emerald-500"
                          : "bg-amber-500",
                    )}
                  />
                  {loading
                    ? "Checking"
                    : state?.ok
                      ? "Operational"
                      : state
                        ? "Degraded"
                        : "Disconnected"}
                </Chip>
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
            </Card>
          );
        })}
      </div>
    </>
  );
}
