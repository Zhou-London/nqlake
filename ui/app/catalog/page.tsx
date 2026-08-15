"use client";

import { useCallback, useEffect, useState } from "react";
import { ResultTable } from "@/components/result-table";
import { Button, Panel, Spinner, StatusBadge } from "@/components/ui";
import { formatBytes, postJson } from "@/lib/client";
import type { CatalogPayload, QueryPayload, TableDetail } from "@/lib/types";

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [preview, setPreview] = useState<QueryPayload | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    setCatalog((await res.json()) as CatalogPayload);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function select(qualified: string) {
    setSelected(qualified);
    setPreview(null);
    setDetail(null);
    setDetailBusy(true);
    const res = await fetch(`/api/catalog?table=${encodeURIComponent(qualified)}`, { cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; table?: TableDetail };
    setDetail(body.table ?? null);
    setDetailBusy(false);
  }

  async function runPreview() {
    if (!selected) return;
    setPreviewBusy(true);
    setPreview(await postJson<QueryPayload>("/api/query", { sql: `SELECT * FROM lake.${selected} LIMIT 50;` }));
    setPreviewBusy(false);
  }

  const summary = detail?.currentSnapshot?.summary ?? {};

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Catalog</h1>
        <p className="mt-0.5 text-sm text-ink-2">Namespaces and Iceberg tables in the NQ Lake warehouse.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Namespaces"
          actions={
            <Button small onClick={load}>
              Refresh
            </Button>
          }
        >
          {!catalog ? (
            <Spinner />
          ) : catalog.namespaces.length === 0 ? (
            <p className="text-sm text-ink-3">
              No namespaces yet. Create one from the SQL page: <code className="font-mono">CREATE SCHEMA lake.market;</code>
            </p>
          ) : (
            <ul className="space-y-3">
              {catalog.namespaces.map((ns) => (
                <li key={ns.name}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{ns.name}</div>
                  {ns.tables.length === 0 ? (
                    <div className="px-2 text-xs text-ink-3">no tables</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {ns.tables.map((t) => {
                        const qualified = `${ns.name}.${t}`;
                        return (
                          <li key={qualified}>
                            <button
                              onClick={() => select(qualified)}
                              className={`w-full rounded-md px-2 py-1 text-left font-mono text-sm transition-colors ${
                                selected === qualified
                                  ? "bg-accent-weak text-accent-strong"
                                  : "text-ink-2 hover:bg-background"
                              }`}
                            >
                              {t}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel
            title={selected ? <span className="font-mono">{selected}</span> : "Table detail"}
            actions={
              selected && (
                <Button small kind="primary" onClick={runPreview} disabled={previewBusy}>
                  {previewBusy ? <Spinner /> : "Preview 50 rows"}
                </Button>
              )
            }
          >
            {!selected ? (
              <p className="text-sm text-ink-3">Select a table to inspect its schema and current snapshot.</p>
            ) : detailBusy ? (
              <Spinner />
            ) : !detail ? (
              <p className="text-sm text-err">Failed to load table metadata.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <StatusBadge tone="accent" label={`format v${detail.formatVersion}`} />
                  <StatusBadge tone="accent" label={`${detail.snapshotCount} snapshots`} />
                  {summary["total-records"] && (
                    <StatusBadge tone="accent" label={`${summary["total-records"]} records`} />
                  )}
                  {summary["total-files-size"] && (
                    <StatusBadge tone="accent" label={formatBytes(Number(summary["total-files-size"]))} />
                  )}
                  {summary["total-data-files"] && (
                    <StatusBadge tone="accent" label={`${summary["total-data-files"]} data files`} />
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-ink-3">
                        <th className="py-1.5 pr-4 font-medium">#</th>
                        <th className="py-1.5 pr-4 font-medium">Column</th>
                        <th className="py-1.5 pr-4 font-medium">Type</th>
                        <th className="py-1.5 font-medium">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.fields.map((f) => (
                        <tr key={f.id} className="border-b border-line/60">
                          <td className="py-1.5 pr-4 tabular-nums text-ink-3">{f.id}</td>
                          <td className="py-1.5 pr-4 font-mono text-ink">{f.name}</td>
                          <td className="py-1.5 pr-4 font-mono text-accent-strong">{f.type}</td>
                          <td className="py-1.5 text-ink-2">{f.required ? "yes" : "no"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-ink-3">
                  <span className="font-medium text-ink-2">Location:</span>{" "}
                  <code className="font-mono">{detail.location}</code>
                  <span className="ml-3 font-medium text-ink-2">Updated:</span>{" "}
                  {new Date(detail.lastUpdatedMs).toLocaleString()}
                </div>
              </div>
            )}
          </Panel>

          {preview && (
            <Panel title="Preview">
              {!preview.ok ? (
                <pre className="whitespace-pre-wrap font-mono text-xs text-err">{preview.error}</pre>
              ) : (
                <ResultTable columns={preview.columns ?? []} rows={preview.rows ?? []} />
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
