"use client";

export function ResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-3">No rows.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr className="text-left text-xs text-ink-2">
            {columns.map((c) => (
              <th key={c} className="border-b border-line px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-accent-weak/40">
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-ink">
                  {r[c] === null ? <span className="text-ink-3">null</span> : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
