"use client";

import { useCallback, useEffect, useState } from "react";
import { ResultTable } from "@/components/result-table";
import { Button, Message, Panel, Spinner, StatusBadge } from "@/components/ui";
import { formatBytes, getJson, postJson, uploadFile } from "@/lib/client";
import type { CatalogPayload, LoadPayload, RowsPayload, TableDetail } from "@/lib/types";

const PAGE_SIZES = [100, 200, 500];
const ACCEPT = ".parquet,.csv,.csv.gz,.tsv,.tsv.gz,.json,.json.gz,.jsonl,.ndjson";

/** Iceberg snapshot summaries carry counts as strings. */
const num = (s?: string) => (s === undefined ? null : Number(s));

export default function TablesPage() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [page, setPage] = useState({ offset: 0, limit: 200 });
  // The rows on screen, tagged with the request that produced them; a page
  // whose tag differs from the current one is still loading.
  const [rows, setRows] = useState<{ key: string; payload: RowsPayload } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadCatalog = useCallback(() => getJson<CatalogPayload>("/api/catalog").then(setCatalog), []);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Selecting a table fetches its metadata (instant, REST) and resets paging;
  // the page effect below then fetches the first rows.
  async function select(qualified: string) {
    setSelected(qualified);
    setDetail(null);
    setRows(null);
    setPage((p) => ({ ...p, offset: 0 }));
    const res = await getJson<{ ok: boolean; table?: TableDetail }>(`/api/catalog?table=${encodeURIComponent(qualified)}`);
    setDetail(res.table ?? null);
  }

  const pageKey = `${selected}:${page.offset}:${page.limit}`;
  useEffect(() => {
    if (!selected) return;
    let stale = false;
    getJson<RowsPayload>(`/api/rows?table=${encodeURIComponent(selected)}&offset=${page.offset}&limit=${page.limit}`).then(
      (payload) => {
        if (!stale) setRows({ key: pageKey, payload });
      },
    );
    return () => {
      stale = true;
    };
  }, [selected, page, pageKey]);
  const rowsBusy = !!selected && rows?.key !== pageKey;
  const current = rows?.key === pageKey ? rows.payload : null;

  async function dropTable() {
    if (!selected || !window.confirm(`Drop ${selected} and purge its data? This cannot be undone.`)) return;
    const res = await postJson<{ ok: boolean; error?: string }>("/api/drop", { table: selected });
    setMessage(res.ok ? { ok: true, text: `Dropped ${selected}.` } : { ok: false, text: res.error ?? "drop failed" });
    if (res.ok) {
      setSelected(null);
      setDetail(null);
      setRows(null);
      loadCatalog();
    }
  }

  async function dropNamespace(ns: string) {
    if (!window.confirm(`Drop the empty namespace ${ns}?`)) return;
    const res = await postJson<{ ok: boolean; error?: string }>("/api/drop", { namespace: ns });
    setMessage(res.ok ? { ok: true, text: `Dropped namespace ${ns}.` } : { ok: false, text: res.error ?? "drop failed" });
    loadCatalog();
  }

  const summary = detail?.currentSnapshot?.summary ?? {};
  const total = num(summary["total-records"]);
  const shown = current?.rowCount ?? 0;
  const lastPage = total !== null ? page.offset + page.limit >= total : shown < page.limit;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Tables</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Iceberg tables in the warehouse: schema and snapshots from the catalog, rows through DuckDB one page at a
          time. Each page starts a client container, so expect a few seconds per page.
        </p>
      </div>

      {message && <Message ok={message.ok} text={message.text} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Panel
            title="Namespaces"
            actions={
              <div className="flex gap-2">
                <Button small onClick={loadCatalog}>
                  Refresh
                </Button>
                <Button small kind="primary" onClick={() => setUploading((u) => !u)}>
                  {uploading ? "Close" : "Upload"}
                </Button>
              </div>
            }
          >
            {!catalog ? (
              <Spinner />
            ) : !catalog.ok ? (
              <p className="text-sm text-err">{catalog.error}</p>
            ) : catalog.namespaces.length === 0 ? (
              <p className="text-sm text-ink-3">No tables yet. Upload a file to create the first one.</p>
            ) : (
              <ul className="space-y-3">
                {catalog.namespaces.map((ns) => (
                  <li key={ns.name}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{ns.name}</span>
                      {ns.tables.length === 0 && (
                        <button onClick={() => dropNamespace(ns.name)} className="text-[11px] text-ink-3 hover:text-err">
                          drop
                        </button>
                      )}
                    </div>
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
                                  selected === qualified ? "bg-accent-weak text-accent-strong" : "text-ink-2 hover:bg-background"
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

          {uploading && (
            <UploadPanel
              suggested={selected}
              onDone={(res) => {
                const widened = (res.widened ?? []).map((w) => `${w.column} ${w.from} → ${w.to}`);
                setMessage(
                  res.ok
                    ? {
                        ok: true,
                        text:
                          `${res.mode} ${res.table}: table now has ${res.tableRows} rows (${res.elapsedMs} ms).` +
                          (widened.length ? ` Widened to Iceberg types: ${widened.join(", ")}.` : ""),
                      }
                    : { ok: false, text: res.error ?? "load failed" },
                );
                if (res.ok && res.table) {
                  loadCatalog();
                  select(res.table);
                }
              }}
            />
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Panel
            title={selected ? <span className="font-mono">{selected}</span> : "Table"}
            actions={
              selected && (
                <Button small kind="danger" onClick={dropTable}>
                  Drop table
                </Button>
              )
            }
          >
            {!selected ? (
              <p className="text-sm text-ink-3">Select a table to inspect its schema and browse its rows.</p>
            ) : !detail ? (
              <Spinner />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <StatusBadge tone="accent" label={`format v${detail.formatVersion}`} />
                  <StatusBadge tone="accent" label={`${detail.snapshotCount} snapshots`} />
                  {total !== null && <StatusBadge tone="accent" label={`${total.toLocaleString()} records`} />}
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
                  <span className="font-medium text-ink-2">Location:</span> <code className="font-mono">{detail.location}</code>
                  <span className="ml-3 font-medium text-ink-2">Updated:</span> {new Date(detail.lastUpdatedMs).toLocaleString()}
                </div>
              </div>
            )}
          </Panel>

          {selected && (
            <Panel
              title="Rows"
              actions={
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="tabular-nums">
                    {current?.ok
                      ? `${shown ? page.offset + 1 : 0}–${page.offset + shown}${total !== null ? ` of ${total.toLocaleString()}` : ""} · ${current.elapsedMs} ms`
                      : ""}
                  </span>
                  <select
                    value={page.limit}
                    onChange={(e) => setPage({ offset: 0, limit: Number(e.target.value) })}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                  <Button
                    small
                    onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
                    disabled={rowsBusy || page.offset === 0}
                  >
                    ‹ Prev
                  </Button>
                  <Button
                    small
                    onClick={() => setPage((p) => ({ ...p, offset: p.offset + p.limit }))}
                    disabled={rowsBusy || lastPage}
                  >
                    Next ›
                  </Button>
                </div>
              }
            >
              {rowsBusy ? (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <Spinner /> reading rows {page.offset + 1}–{page.offset + page.limit}…
                </div>
              ) : current && !current.ok ? (
                <pre className="whitespace-pre-wrap font-mono text-xs text-err">{current.error}</pre>
              ) : (
                <ResultTable columns={current?.columns ?? []} rows={current?.rows ?? []} maxHeight="max-h-[32rem]" />
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/** File picker plus target table; streams the file to /api/upload and reports the load result. */
function UploadPanel({ suggested, onDone }: { suggested: string | null; onDone: (res: LoadPayload) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState(suggested ?? "");
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const valid = !!file && /^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(table);

  async function submit() {
    if (!file || !valid) return;
    setProgress(0);
    const url = `/api/upload?table=${encodeURIComponent(table)}&name=${encodeURIComponent(file.name)}${replace ? "&replace=1" : ""}`;
    const res = await uploadFile<LoadPayload>(url, file, setProgress);
    setProgress(null);
    onDone(res);
  }

  return (
    <Panel title="Upload a file">
      <div className="space-y-3 text-sm">
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f && !table) setTable(`data.${f.name.replace(/\..*$/, "").replace(/\W/g, "_")}`);
          }}
          className="block w-full text-xs text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-2.5 file:py-1 file:text-xs file:text-ink-2"
        />
        <label className="block">
          <span className="text-xs text-ink-3">Target table</span>
          <input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="namespace.table"
            spellCheck={false}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2 py-1 font-mono text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          replace the table instead of appending
        </label>
        <p className="text-xs text-ink-3">
          Parquet, CSV/TSV, or JSON(L), optionally gzipped. A new table takes the file&apos;s schema; an existing one is
          appended to by column name.
        </p>
        {progress !== null && (
          <div className="h-1.5 rounded-full bg-background">
            <div className="h-1.5 rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <Button kind="primary" onClick={submit} disabled={!valid || progress !== null}>
          {progress === null ? "Upload and load" : progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : <Spinner />}
        </Button>
      </div>
    </Panel>
  );
}
