"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel, Spinner, StatusBadge, type Tone } from "@/components/ui";
import { postJson, usePoll } from "@/lib/client";
import type { LogsPayload, StatusPayload } from "@/lib/types";

const SERVICES = ["minio", "postgres", "lakekeeper"] as const;
const LOG_SOURCES = [...SERVICES, "minio-init", "lakekeeper-migrate", "lakekeeper-init"] as const;

export default function OpsPage() {
  const { data: status, refresh } = usePoll<StatusPayload>("/api/status", 5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [logService, setLogService] = useState<string>("lakekeeper");
  const [logs, setLogs] = useState<LogsPayload | null>(null);
  const [auto, setAuto] = useState(false);
  const logBox = useRef<HTMLPreElement>(null);

  async function op(action: string, service?: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const key = service ? `${action}:${service}` : action;
    setBusy(key);
    setMessage(null);
    const res = await postJson<{ ok: boolean; error?: string; result?: { ok: boolean; detail?: string } }>(
      "/api/ops",
      { action, service },
    );
    setBusy(null);
    if (action === "smoke" && res.result) {
      setMessage({
        ok: res.result.ok,
        text: res.result.ok ? `Smoke test passed.\n${res.result.detail ?? ""}` : `Smoke test FAILED.\n${res.result.detail ?? ""}`,
      });
    } else {
      setMessage(res.ok ? { ok: true, text: `${key} done.` } : { ok: false, text: res.error ?? "failed" });
    }
    refresh();
  }

  async function loadLogs(svc = logService) {
    const res = await fetch(`/api/logs?service=${svc}&tail=200`, { cache: "no-store" });
    setLogs((await res.json()) as LogsPayload);
  }

  useEffect(() => {
    loadLogs(logService);
    if (!auto) return;
    const id = setInterval(() => loadLogs(logService), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logService, auto]);

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [logs]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Operations</h1>
        <p className="mt-0.5 text-sm text-ink-2">Administrative controls for the NQ Lake stack.</p>
      </div>

      {message && (
        <div
          className={`whitespace-pre-wrap rounded-lg border px-4 py-2.5 font-mono text-xs ${
            message.ok ? "border-line bg-ok-weak text-ok" : "border-err/40 bg-err-weak text-err"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {SERVICES.map((svc) => {
          const c = status?.components[svc];
          const running = c?.state === "running";
          const tone: Tone = running ? (c?.health === "healthy" ? "ok" : "warn") : "err";
          return (
            <Panel
              key={svc}
              title={svc}
              actions={<StatusBadge tone={tone} label={c?.state ?? "…"} />}
            >
              <div className="mb-3 text-xs text-ink-3">{c?.status ?? "—"}</div>
              <div className="flex gap-2">
                <Button
                  small
                  onClick={() => op("start", svc)}
                  disabled={busy !== null || running}
                >
                  Start
                </Button>
                <Button
                  small
                  onClick={() => op("restart", svc)}
                  disabled={busy !== null || !running}
                >
                  {busy === `restart:${svc}` ? <Spinner /> : "Restart"}
                </Button>
                <Button
                  small
                  kind="danger"
                  onClick={() => op("stop", svc, `Stop ${svc}? Dependent components may degrade.`)}
                  disabled={busy !== null || !running}
                >
                  {busy === `stop:${svc}` ? <Spinner /> : "Stop"}
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel title="Stack">
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="primary" onClick={() => op("stack-up")} disabled={busy !== null}>
            {busy === "stack-up" ? <Spinner /> : "Up (start + re-run init)"}
          </Button>
          <Button onClick={() => op("smoke")} disabled={busy !== null}>
            {busy === "smoke" ? <Spinner /> : "Run smoke test"}
          </Button>
          <Button
            kind="danger"
            onClick={() => op("stack-stop", undefined, "Stop the whole stack? The console loses all data sources until it is started again.")}
            disabled={busy !== null}
          >
            {busy === "stack-stop" ? <Spinner /> : "Stop stack"}
          </Button>
          <span className="ml-2 text-xs text-ink-3">
            `Up` is idempotent: it re-runs bucket/user provisioning and catalog bootstrap, then leaves
            services running.
          </span>
        </div>
      </Panel>

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
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[var(--accent)]" />
              auto-refresh
            </label>
            <Button small onClick={() => loadLogs()}>
              Refresh
            </Button>
          </div>
        }
      >
        <pre
          ref={logBox}
          className="max-h-96 overflow-auto rounded-lg bg-[#0f172a] p-3 font-mono text-[11px] leading-relaxed text-slate-200"
        >
          {logs?.ok ? logs.lines?.join("\n") || "(empty)" : logs?.error ?? "loading…"}
        </pre>
      </Panel>
    </div>
  );
}
