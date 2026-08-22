"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, Panel, Spinner, StatusBadge, type Tone } from "@/components/ui";
import { postJson, usePoll } from "@/lib/client";
import type { PortsPayload } from "@/lib/types";

/** What has to be restarted before a saved port takes effect. */
const RESTART: Record<string, string> = {
  stack: "Apply below, or run `make up`.",
  console: "Restart `make console`; this page moves with it.",
};

/** The port this page is served on; empty string while server-rendering. */
function useBrowserPort(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.port,
    () => "",
  );
}

export default function PortsPage() {
  const { data, refresh } = usePoll<PortsPayload>("/api/ports", 0);
  // Only the fields the user has touched; everything else reads from .env.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const browserPort = useBrowserPort();

  const entries = data?.ports ?? [];
  const saved = (key: string) => {
    const value = entries.find((p) => p.key === key)?.value;
    return value == null ? "" : String(value);
  };
  const edited = entries.filter(
    (p) => draft[p.key] !== undefined && draft[p.key] !== saved(p.key),
  );
  const pending = entries.filter((p) => p.pending);
  const consoleEntry = entries.find((p) => p.key === "CONSOLE_PORT");
  const consoleMoved =
    browserPort !== "" &&
    consoleEntry?.value != null &&
    String(consoleEntry.value) !== browserPort;

  async function save() {
    setBusy("save");
    setMessage(null);
    const changes = Object.fromEntries(edited.map((p) => [p.key, draft[p.key]]));
    const res = await postJson<PortsPayload>("/api/ports", { ports: changes });
    setBusy(null);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error ?? "failed" });
      return;
    }
    setDraft({});
    setMessage({
      ok: true,
      text: `Written to .env: ${(res.changed ?? [])
        .map((c) => `${c.key} ${c.from ?? "unset"} → ${c.to}`)
        .join(", ")}. ${(res.restart ?? []).map((r) => RESTART[r]).join(" ")}`,
    });
    refresh();
  }

  async function apply() {
    setBusy("apply");
    setMessage(null);
    const res = await postJson<{ ok: boolean; error?: string }>("/api/ops", {
      action: "stack-up",
    });
    setBusy(null);
    setMessage(
      res.ok
        ? { ok: true, text: "Stack recreated on the configured ports." }
        : { ok: false, text: res.error ?? "failed" },
    );
    refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Ports</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Every port the stack binds, kept in{" "}
          <code className="font-mono text-accent-strong">.env</code>. A service listens on the same
          number it publishes, so one value moves it everywhere — compose, the init jobs, and this
          console all read it from there.
        </p>
      </div>

      {message && (
        <div
          className={`whitespace-pre-wrap rounded-lg border px-4 py-2.5 text-xs ${
            message.ok ? "border-line bg-ok-weak text-ok" : "border-err/40 bg-err-weak text-err"
          }`}
        >
          {message.text}
        </div>
      )}

      <Panel
        title="Components"
        actions={
          <div className="flex items-center gap-2">
            <Button small onClick={() => setDraft({})} disabled={busy !== null || !edited.length}>
              Revert
            </Button>
            <Button small kind="primary" onClick={save} disabled={busy !== null || !edited.length}>
              {busy === "save" ? <Spinner /> : `Save${edited.length ? ` (${edited.length})` : ""}`}
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-line">
          {!entries.length && <div className="text-sm text-ink-3">loading…</div>}
          {entries.map((p) => {
            const value = draft[p.key] ?? saved(p.key);
            const dirty = value !== saved(p.key);
            // The console has no container: the port serving this page is the
            // evidence for whether its .env value is in effect.
            const live =
              p.applies === "console"
                ? browserPort !== "" && String(p.value) === browserPort
                : p.running && !p.pending;
            const stale = p.applies === "console" ? browserPort !== "" && !live : p.pending;
            const tone: Tone = dirty ? "accent" : stale ? "warn" : live ? "ok" : "muted";
            const state = dirty
              ? "unsaved"
              : stale
                ? "needs restart"
                : live
                  ? "live"
                  : "not running";
            return (
              <div key={p.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{p.label}</span>
                    <code className="font-mono text-[11px] text-ink-3">{p.key}</code>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-2">{p.description}</div>
                  {p.error && <div className="mt-0.5 text-xs text-err">{p.error}</div>}
                </div>
                <div className="flex w-60 items-center justify-end gap-2">
                  {p.url && p.value !== null && !dirty && !p.pending && (
                    <a
                      href={`http://localhost:${p.value}${p.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:text-accent-strong"
                    >
                      open
                    </a>
                  )}
                  <StatusBadge tone={tone} label={state} />
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={value}
                    onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })}
                    className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-right font-mono text-sm text-ink tabular-nums outline-none focus:border-accent"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Apply">
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="primary" onClick={apply} disabled={busy !== null}>
            {busy === "apply" ? <Spinner /> : "Recreate stack on saved ports"}
          </Button>
          <span className="text-xs text-ink-3">
            Runs `docker compose up -d`: containers whose ports moved are recreated, the init jobs
            re-run, and the warehouse is repointed at MinIO&apos;s current address.
          </span>
        </div>
        <div className="mt-3 space-y-1 text-xs">
          {pending.length > 0 && (
            <div className="text-warn">
              Running on other ports: {pending.map((p) => p.key).join(", ")}.
            </div>
          )}
          {consoleMoved && (
            <div className="text-warn">
              CONSOLE_PORT is {consoleEntry?.value}, this page is served on {browserPort}.{" "}
              {RESTART.console}
            </div>
          )}
          {!pending.length && !consoleMoved && !edited.length && (
            <div className="text-ink-3">Every component runs on its configured port.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}
