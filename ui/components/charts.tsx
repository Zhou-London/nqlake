"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/client";

/** Single-series sparkline; identity comes from surrounding context. */
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
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="h-9 w-full min-w-0"
        preserveAspectRatio="none"
        aria-hidden
      >
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

/**
 * Hourly API activity: total calls in accent, error share in the reserved
 * error color. Two series, so a legend is rendered; per-bar hover tooltip.
 */
export function ApiActivityChart({
  series,
}: {
  series: { timestamp: string; calls: number; errors: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return <p className="text-sm text-ink-3">No API activity recorded yet.</p>;
  const max = Math.max(...series.map((s) => s.calls), 1);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {series.map((s, i) => (
          <div
            key={s.timestamp}
            className="relative flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm">
                <div className="font-medium text-ink">
                  {new Date(s.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" })}
                </div>
                <div className="tabular-nums text-ink-2">
                  {s.calls} calls{s.errors > 0 ? ` · ${s.errors} errors` : ""}
                </div>
              </div>
            )}
            <div
              className="w-full rounded-t-[4px] bg-accent"
              style={{ height: `${(s.calls / max) * 100}%`, minHeight: s.calls > 0 ? 3 : 0 }}
            />
            {s.errors > 0 && (
              <div
                className="w-full bg-err"
                style={{ height: `${(s.errors / max) * 100}%`, minHeight: 2 }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{new Date(series[0].timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" })}</span>
        <span>{new Date(series[series.length - 1].timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" })}</span>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-accent" /> calls
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-err" /> errors
        </span>
      </div>
    </div>
  );
}

/** Labeled horizontal bars, one hue; identity is carried by the row label. */
export function StorageBars({
  rows,
}: {
  rows: { label: string; bytes: number; hint?: string }[];
}) {
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
