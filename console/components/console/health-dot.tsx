"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** One line in the sidebar footer: the warehouse and whether every service answers. */
export function HealthDot() {
  const status = useResource(api.status, "status", { interval: 30_000 });
  const ok = status.data?.ok;
  const failing = status.data?.services.filter((s) => !s.ok).length ?? 0;
  const label = status.error
    ? "API unreachable"
    : status.data
      ? ok
        ? "All services up"
        : `${failing} service${failing === 1 ? "" : "s"} down`
      : "Checking…";
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <span
        className={cn(
          "size-2 rounded-full",
          status.error || ok === false
            ? "bg-destructive"
            : ok
              ? "bg-emerald-500"
              : "bg-muted-foreground/40",
        )}
      />
      <span className="truncate">{label}</span>
      {status.data && (
        <span className="ml-auto truncate font-mono">
          {status.data.warehouse}
        </span>
      )}
    </Link>
  );
}
