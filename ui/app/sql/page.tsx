"use client";

import { useState } from "react";
import { ResultTable } from "@/components/result-table";
import { Button, Panel, Spinner } from "@/components/ui";
import { postJson } from "@/lib/client";
import type { QueryPayload } from "@/lib/types";

const SNIPPETS: { label: string; sql: string }[] = [
  { label: "Show namespaces", sql: "SELECT * FROM (SHOW ALL TABLES);" },
  {
    label: "Create schema",
    sql: "CREATE SCHEMA IF NOT EXISTS lake.market;",
  },
  {
    label: "Create table",
    sql: `CREATE TABLE IF NOT EXISTS lake.market.trades (
  ts  TIMESTAMP,
  sym VARCHAR,
  px  DOUBLE,
  qty BIGINT
);`,
  },
  {
    label: "Query trades",
    sql: `SELECT sym, count(*) AS trades, round(sum(px * qty), 2) AS notional
FROM lake.market.trades
GROUP BY sym
ORDER BY notional DESC;`,
  },
];

export default function SqlPage() {
  const [sql, setSql] = useState<string>(SNIPPETS[3].sql);
  const [result, setResult] = useState<QueryPayload | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy || !sql.trim()) return;
    setBusy(true);
    setResult(null);
    setResult(await postJson<QueryPayload>("/api/query", { sql }));
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">SQL</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Runs DuckDB against the NQ Lake catalog (attached as{" "}
          <code className="font-mono text-accent-strong">lake</code>). Each run starts a fresh client
          container — expect a few seconds of overhead.
        </p>
      </div>

      <Panel
        title="Statement"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-3">⌘⏎ to run</span>
            <Button small kind="primary" onClick={run} disabled={busy}>
              {busy ? <Spinner /> : "Run"}
            </Button>
          </div>
        }
      >
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          spellCheck={false}
          rows={8}
          className="w-full resize-y rounded-lg border border-line bg-background p-3 font-mono text-sm text-ink outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSql(s.sql)}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent-strong"
            >
              {s.label}
            </button>
          ))}
        </div>
      </Panel>

      {(busy || result) && (
        <Panel
          title="Result"
          actions={
            result?.ok && (
              <span className="text-xs tabular-nums text-ink-3">
                {result.rowCount} rows{result.truncated ? " (truncated)" : ""} · {result.elapsedMs} ms
              </span>
            )
          }
        >
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner /> running…
            </div>
          ) : result?.ok ? (
            <ResultTable columns={result.columns ?? []} rows={result.rows ?? []} />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs text-err">{result?.error}</pre>
          )}
        </Panel>
      )}
    </div>
  );
}
