"use client";

import { useEffect, useRef, useState } from "react";
import { ApiActivityChart, Sparkline, StorageBars } from "@/components/charts";
import { Button, Panel, Spinner, StatTile, StatusBadge, type Tone } from "@/components/ui";
import { formatAgo, formatBytes, postJson, usePoll } from "@/lib/client";
import type { Component, StatsPayload, StatusPayload } from "@/lib/types";

const CORE = [
  { key: "minio", name: "MinIO", role: "Object store · Parquet" },
  { key: "postgres", name: "Postgres", role: "Catalog metadata" },
  { key: "lakekeeper", name: "Lakekeeper", role: "Iceberg REST catalog" },
] as const;

function componentTone(c?: Component): { tone: Tone; label: string } {
  if (!c || c.state === "absent") return { tone: "muted", label: "absent" };
  if (c.oneshot) {
    if (c.state === "exited" && c.exitCode === 0) return { tone: "ok", label: "completed" };
    if (c.state === "running") return { tone: "accent", label: "running" };
    return { tone: "err", label: `exit ${c.exitCode}` };
  }
  if (c.state === "running" && (c.health === "healthy" || c.health === null) && c.api !== false)
    return { tone: "ok", label: "healthy" };
  if (c.state === "running") return { tone: "warn", label: c.health ?? "degraded" };
  return { tone: "err", label: c.state };
}

function LinkPill({ ok, from, to }: { ok: boolean; from: string; to: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-right font-medium text-ink-2">{from}</span>
      <span
        className={`relative h-0.5 flex-1 rounded ${ok ? "bg-accent" : "bg-err"}`}
      >
        <span
          className={`absolute -top-[3px] right-0 h-2 w-2 rotate-45 border-r-2 border-t-2 ${
            ok ? "border-accent" : "border-err"
          }`}
        />
      </span>
      <span className="w-24 font-medium text-ink-2">{to}</span>
      <StatusBadge tone={ok ? "ok" : "err"} label={ok ? "linked" : "broken"} />
    </div>
  );
}

export default function Overview() {
  const { data: status, refresh: refreshStatus } = usePoll<StatusPayload>("/api/status", 5000);
  const { data: stats } = usePoll<StatsPayload>("/api/stats", 8000);
  const cpuHistory = useRef<Record<string, number[]>>({});
  const memHistory = useRef<Record<string, number[]>>({});
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!stats?.containers) return;
    for (const [svc, c] of Object.entries(stats.containers)) {
      const cpu = (cpuHistory.current[svc] ??= []);
      const mem = (memHistory.current[svc] ??= []);
      cpu.push(c.cpuPercent);
      mem.push(c.memBytes);
      if (cpu.length > 48) cpu.shift();
      if (mem.length > 48) mem.shift();
    }
  }, [stats]);

  const components = status?.components ?? {};
  const runningCore = CORE.filter((c) => components[c.key]?.state === "running").length;
  const links = status?.links;
  const allLinked =
    !!links && links["lakekeeper-postgres"].ok && links["lakekeeper-minio"].ok;
  const totalCalls = stats?.apiSeries.reduce((a, s) => a + s.calls, 0) ?? 0;
  const latestTables = stats?.tableCount ?? stats?.warehouseStats?.at(-1)?.tables;

  async function runOp(action: string, service?: string) {
    setBusy(service ?? action);
    await postJson("/api/ops", { action, service });
    setBusy(null);
    refreshStatus();
  }

  async function runSmoke() {
    setSmokeBusy(true);
    await postJson("/api/ops", { action: "smoke" });
    setSmokeBusy(false);
    refreshStatus();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Overview</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            NQ Lake · warehouse{" "}
            <span className="font-medium text-accent-strong">
              {status?.warehouse?.name ?? "—"}
            </span>{" "}
            · Lakekeeper {status?.server?.version ?? "—"}
          </p>
        </div>
        <StatusBadge
          tone={runningCore === CORE.length && allLinked ? "ok" : runningCore > 0 ? "warn" : "err"}
          label={
            runningCore === CORE.length && allLinked
              ? "all systems operational"
              : `${runningCore}/${CORE.length} services up`
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Services running" value={`${runningCore} / ${CORE.length}`} hint="core components" />
        <StatTile
          label="Iceberg tables"
          value={latestTables ?? "—"}
          hint={status?.warehouse ? `warehouse ${status.warehouse.name}` : undefined}
        />
        <StatTile
          label="Bucket size"
          value={stats ? formatBytes(stats.storage.bucket.bytes) : "—"}
          hint={stats ? `${stats.storage.bucket.files} objects` : undefined}
        />
        <StatTile label="Catalog API calls" value={totalCalls} hint="recorded by Lakekeeper" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {CORE.map(({ key, name, role }) => {
          const c = components[key];
          const { tone, label } = componentTone(c);
          const cs = stats?.containers[key];
          return (
            <Panel
              key={key}
              title={
                <span>
                  {name} <span className="ml-1 font-normal text-ink-3">{role}</span>
                </span>
              }
              actions={<StatusBadge tone={tone} label={label} />}
            >
              <div className="space-y-3">
                <div className="text-xs text-ink-3">{c?.status ?? "not created"}</div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[11px] text-ink-3">
                    <span>CPU</span>
                  </div>
                  <Sparkline
                    points={cpuHistory.current[key] ?? []}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[11px] text-ink-3">
                    <span>Memory</span>
                  </div>
                  <Sparkline
                    points={memHistory.current[key] ?? []}
                    formatValue={() => (cs ? formatBytes(cs.memBytes) : "—")}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button small onClick={() => runOp("restart", key)} disabled={busy === key}>
                    {busy === key ? <Spinner /> : "Restart"}
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Coordination"
          actions={
            <Button small kind="primary" onClick={runSmoke} disabled={smokeBusy}>
              {smokeBusy ? <Spinner /> : "Run smoke test"}
            </Button>
          }
        >
          <div className="space-y-3.5">
            <LinkPill ok={!!links?.["lakekeeper-postgres"].ok} from="Lakekeeper" to="Postgres" />
            <LinkPill ok={!!links?.["lakekeeper-minio"].ok} from="Lakekeeper" to="MinIO" />
            <LinkPill ok={!!links?.["duckdb-stack"].ok} from="DuckDB" to="Lakehouse" />
            <div className="rounded-lg bg-background px-3 py-2 text-xs text-ink-2">
              {links?.["duckdb-stack"].at ? (
                <>
                  Last smoke test{" "}
                  <span className={links["duckdb-stack"].ok ? "font-medium text-ok" : "font-medium text-err"}>
                    {links["duckdb-stack"].ok ? "passed" : "failed"}
                  </span>{" "}
                  {formatAgo(links["duckdb-stack"].at)}
                  {links["duckdb-stack"].detail && (
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-3">
                      {links["duckdb-stack"].detail}
                    </pre>
                  )}
                </>
              ) : (
                "No smoke test recorded yet — run one to verify the full write/read path."
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
              {(["minio-init", "lakekeeper-migrate", "lakekeeper-init"] as const).map((job) => {
                const j = components[job];
                const done = j?.state === "exited" && j.exitCode === 0;
                return (
                  <span key={job} className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-ok" : "bg-ink-3"}`} />
                    {job}
                  </span>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel title="Storage">
          {stats ? (
            <StorageBars
              rows={[
                {
                  label: `s3://${stats.storage.bucket.name}`,
                  bytes: stats.storage.bucket.bytes,
                  hint: `${stats.storage.bucket.parquetFiles} parquet · ${formatBytes(stats.storage.bucket.parquetBytes)}`,
                },
                {
                  label: "postgres catalog",
                  bytes: stats.storage.postgres.bytes,
                  hint: `${stats.storage.postgres.files} files`,
                },
                {
                  label: "duckdb scratch",
                  bytes: stats.storage.duckdb.bytes,
                  hint: `${stats.storage.duckdb.files} files`,
                },
              ]}
            />
          ) : (
            <Spinner />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Catalog API activity" className="xl:col-span-2">
          <ApiActivityChart series={stats?.apiSeries ?? []} />
        </Panel>
        <Panel title="Top routes">
          <ul className="space-y-1.5">
            {(stats?.apiRoutes ?? []).slice(0, 8).map((r) => (
              <li key={r.route} className="flex items-baseline justify-between gap-2 text-xs">
                <code className="truncate font-mono text-ink-2">{r.route}</code>
                <span className="shrink-0 font-medium tabular-nums text-accent-strong">{r.count}</span>
              </li>
            ))}
            {!stats?.apiRoutes.length && <li className="text-sm text-ink-3">—</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
