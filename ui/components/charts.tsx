"use client";

import { formatBytes } from "@/lib/client";

/** Single-series sparkline with the latest value beside it. */
export function Sparkline({
  points,
  height = 36,
  formatValue = (v: number) => v.toFixed(1),
}: {
  points: number[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const w = 200;
  const max = Math.max(...points, 0.001);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${((points.length - 1) * step).toFixed(1)},${height} L0,${height} Z`;
  const last = points[points.length - 1] ?? 0;
  return (
    <div className="flex items-end gap-2">
      <svg viewBox={`0 0 ${w} ${height}`} className="h-9 w-full min-w-0" preserveAspectRatio="none" aria-hidden>
        {points.length > 1 && (
          <>
            <path d={area} fill="var(--accent-weak)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <span className="shrink-0 text-xs font-medium tabular-nums text-ink-2">{formatValue(last)}</span>
    </div>
  );
}

/** Labeled horizontal bars, one hue; identity is carried by the row label. */
export function StorageBars({ rows }: { rows: { label: string; bytes: number; hint?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.bytes), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium text-ink-2">
              {r.label}
              {r.hint && <span className="ml-1.5 font-normal text-ink-3">{r.hint}</span>}
            </span>
            <span className="tabular-nums text-ink-2">{formatBytes(r.bytes)}</span>
          </div>
          <div className="h-2 rounded-full bg-background">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max((r.bytes / max) * 100, r.bytes > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
