"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkline, StorageBars } from "@/components/charts";
import { Button, Message, Panel, Spinner, StatTile, StatusBadge, type Tone } from "@/components/ui";
import { formatBytes, getJson, postJson, usePoll } from "@/lib/client";
import type { Component, LogsPayload, OpsPayload, StatsPayload, StatusPayload } from "@/lib/types";

const SERVICES = [
  { key: "minio", name: "MinIO", role: "object store" },
  { key: "postgres", name: "Postgres", role: "catalog metadata" },
  { key: "lakekeeper", name: "Lakekeeper", role: "Iceberg REST catalog" },
] as const;
const JOBS = ["minio-init", "lakekeeper-migrate", "lakekeeper-init"] as const;
const LOG_SOURCES = [...SERVICES.map((s) => s.key), ...JOBS];
const HISTORY = 48; // samples kept per sparkline

function componentTone(c?: Component): { tone: Tone; label: string } {
  if (!c || c.state === "absent") return { tone: "muted", label: "absent" };
  if (c.oneshot) {
    if (c.state === "exited" && c.exitCode === 0) return { tone: "ok", label: "completed" };
    if (c.state === "running") return { tone: "accent", label: "running" };
    return { tone: "err", label: `exit ${c.exitCode}` };
  }
  if (c.state === "running" && (c.health === "healthy" || c.health === null)) return { tone: "ok", label: "healthy" };
  if (c.state === "running") return { tone: "warn", label: c.health ?? "degraded" };
  return { tone: "err", label: c.state };
}

type History = Record<string, { cpu: number[]; mem: number[] }>;

/** The last HISTORY samples of each container, appended as stats polls arrive. */
function useHistory(stats: StatsPayload | null): History {
  const [kept, setKept] = useState<{ source: StatsPayload | null; series: History }>({ source: null, series: {} });
  if (stats && stats !== kept.source) {
    const series: History = { ...kept.series };
    for (const [svc, c] of Object.entries(stats.containers ?? {})) {
      const h = series[svc] ?? { cpu: [], mem: [] };
      series[svc] = { cpu: [...h.cpu, c.cpuPercent].slice(-HISTORY), mem: [...h.mem, c.memBytes].slice(-HISTORY) };
    }
    setKept({ source: stats, series });
  }
  return kept.series;
}

export default function Overview() {
  const { data: status, refresh } = usePoll<StatusPayload>("/api/status", 5000);
  const { data: stats } = usePoll<StatsPayload>("/api/stats", 8000);
  const history = useHistory(stats);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [logService, setLogService] = useState<string>("lakekeeper");
  const [logs, setLogs] = useState<LogsPayload | null>(null);
  const [follow, setFollow] = useState(false);
  const logBox = useRef<HTMLPreElement>(null);

  const loadLogs = useCallback(
    () => getJson<LogsPayload>(`/api/logs?service=${logService}&tail=200`).then(setLogs),
    [logService],
  );
  useEffect(() => {
    loadLogs();
    if (!follow) return;
    const id = setInterval(loadLogs, 4000);
    return () => clearInterval(id);
  }, [loadLogs, follow]);

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [logs]);

  async function op(action: string, service?: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const key = service ? `${action}:${service}` : action;
    setBusy(key);
    setMessage(null);
    const res = await postJson<OpsPayload>("/api/ops", { action, service });
    setBusy(null);
    setMessage(
      res.ok
        ? { ok: true, text: `${key} done in ${res.elapsedMs} ms.${res.detail ? `\n${res.detail}` : ""}` }
        : { ok: false, text: `${key} failed.\n${res.error ?? ""}` },
    );
    refresh();
  }

  const components = status?.components ?? {};
  const up = SERVICES.filter((s) => components[s.key]?.state === "running").length;
  const catalog = status?.catalog;
  const allGood = up === SERVICES.length && !!catalog?.reachable && catalog.dbOk && status?.warehouse?.status === "active";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Overview</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            warehouse <span className="font-medium text-accent-strong">{status?.warehouse?.name ?? "—"}</span>
            {status?.warehouse && <span className="text-ink-3"> ({status.warehouse.status})</span>} · Lakekeeper{" "}
            {catalog?.version ?? "—"}
          </p>
        </div>
        <StatusBadge
          tone={allGood ? "ok" : up > 0 ? "warn" : "err"}
          label={allGood ? "all systems operational" : `${up}/${SERVICES.length} services up`}
        />
      </div>

      {message && <Message ok={message.ok} text={message.text} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Services running" value={`${up} / ${SERVICES.length}`} hint="minio · postgres · lakekeeper" />
        <StatTile
          label="Catalog"
          value={catalog?.reachable ? "reachable" : "down"}
          tone={catalog?.reachable ? "accent" : "err"}
          hint={catalog ? `metadata db ${catalog.dbOk ? "ok" : "broken"}` : undefined}
        />
        <StatTile label="Bucket on disk" value={stats ? formatBytes(stats.storage.bucket) : "—"} hint="Parquet + Iceberg metadata" />
        <StatTile label="Catalog DB on disk" value={stats ? formatBytes(stats.storage.postgres) : "—"} hint="Postgres data directory" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {SERVICES.map(({ key, name, role }) => {
          const c = components[key];
          const { tone, label } = componentTone(c);
          const cs = stats?.containers[key];
          const running = c?.state === "running";
          const h = history[key];
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
                  <div className="mb-0.5 text-[11px] text-ink-3">CPU</div>
                  <Sparkline points={h?.cpu ?? []} formatValue={(v) => `${v.toFixed(1)}%`} />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[11px] text-ink-3">
                    <span>Memory</span>
                    {cs && <span>limit {formatBytes(cs.memLimitBytes)}</span>}
                  </div>
                  <Sparkline points={h?.mem ?? []} formatValue={(v) => formatBytes(v)} />
                </div>
                <div className="flex gap-4 text-[11px] tabular-nums text-ink-3">
                  <span>pids {cs?.pids ?? "—"}</span>
                  <span>net {cs?.netIO ?? "—"}</span>
                  <span>block {cs?.blockIO ?? "—"}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button small onClick={() => op("start", key)} disabled={busy !== null || running}>
                    Start
                  </Button>
                  <Button small onClick={() => op("restart", key)} disabled={busy !== null || !running}>
                    {busy === `restart:${key}` ? <Spinner /> : "Restart"}
                  </Button>
                  <Button
                    small
                    kind="danger"
                    onClick={() => op("stop", key, `Stop ${name}? Dependent components will degrade.`)}
                    disabled={busy !== null || !running}
                  >
                    {busy === `stop:${key}` ? <Spinner /> : "Stop"}
                  </Button>
                  <Button small onClick={() => setLogService(key)} disabled={logService === key}>
                    Logs
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Stack"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button small kind="primary" onClick={() => op("stack-up")} disabled={busy !== null}>
                {busy === "stack-up" ? <Spinner /> : "Up"}
              </Button>
              <Button small onClick={() => op("smoke")} disabled={busy !== null}>
                {busy === "smoke" ? <Spinner /> : "Smoke test"}
              </Button>
              <Button
                small
                kind="danger"
                onClick={() => op("stack-stop", undefined, "Stop the whole stack?")}
                disabled={busy !== null}
              >
                {busy === "stack-stop" ? <Spinner /> : "Stop stack"}
              </Button>
            </div>
          }
        >
          <p className="text-xs text-ink-2">
            <span className="font-medium">Up</span> is <code className="font-mono">docker compose up -d</code>: it
            re-runs the init jobs and recreates services whose ports moved. The smoke test writes and reads an
            Iceberg table end to end through a throwaway DuckDB client.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {JOBS.map((job) => {
              const { tone, label } = componentTone(components[job]);
              return (
                <span key={job} className="inline-flex items-center gap-1.5 text-ink-2">
                  <StatusBadge tone={tone} label={label} />
                  {job}
                </span>
              );
            })}
          </div>
        </Panel>

        <Panel title="Storage on disk">
          {stats ? (
            <StorageBars
              rows={[
                { label: "MinIO bucket", bytes: stats.storage.bucket, hint: "images/minio/data" },
                { label: "Postgres catalog", bytes: stats.storage.postgres, hint: "images/postgres/data" },
                { label: "DuckDB scratch", bytes: stats.storage.duckdb, hint: "images/duckdb/work" },
              ]}
            />
          ) : (
            <Spinner />
          )}
        </Panel>
      </div>

      <Panel
        title="Logs"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={logService}
              onChange={(e) => setLogService(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent"
            >
              {LOG_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              follow
            </label>
            <Button small onClick={loadLogs}>
              Refresh
            </Button>
          </div>
        }
      >
        <pre
          ref={logBox}
          className="max-h-96 overflow-auto rounded-lg bg-[#0f172a] p-3 font-mono text-[11px] leading-relaxed text-slate-200"
        >
          {logs === null ? "loading…" : logs.ok ? logs.lines?.join("\n") || "(empty)" : logs.error}
        </pre>
      </Panel>
    </div>
  );
}
