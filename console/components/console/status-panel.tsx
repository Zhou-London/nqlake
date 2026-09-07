"use client";

import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNotice } from "@/components/console/error-notice";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const DESCRIPTIONS: Record<string, string> = {
  lakekeeper: "Iceberg REST catalog",
  minio: "S3 object store",
  postgres: "Catalog metadata",
  catalog: "Warehouse reachable through PyIceberg",
  duckdb: "Query engine, catalog attached",
};

export function StatusPanel() {
  const status = useResource(api.status, "status", { interval: 30_000 });
  const stale = Boolean(status.error && status.data);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Services</h2>
        {status.data && (
          <Badge
            variant={status.data.ok ? "secondary" : "destructive"}
            className={cn(
              status.data.ok && "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {status.data.ok ? "All up" : "Degraded"}
          </Badge>
        )}
        {stale && <Badge variant="outline">Stale</Badge>}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={status.reload}
          aria-label="Refresh"
        >
          <RefreshCw className={cn(status.refreshing && "animate-spin")} />
        </Button>
      </div>
      {status.error && (
        <ErrorNotice title="Health check failed" message={status.error} />
      )}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {status.data
          ? status.data.services.map((service) => (
              <div
                key={service.name}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border bg-card p-3",
                  !service.ok && "border-destructive/40",
                  stale && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  {service.ok ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">{service.name}</span>
                  {service.port !== null && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      :{service.port}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {DESCRIPTIONS[service.name] ?? ""}
                </p>
                <p
                  className="truncate font-mono text-xs"
                  title={service.detail}
                >
                  {service.detail}
                </p>
              </div>
            ))
          : !status.error &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
      </div>
    </section>
  );
}
