"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toRgba, useChartTheme } from "@nowquant/nqui/charts";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SeriesPoint } from "@/lib/features";
import { compact, decimalsFor, scaled, utcSeconds } from "@/lib/format";
import type { OhlcvBar } from "@/lib/ohlcv";

const SECONDS_PER_DAY = 86_400;
const NARROWEST_BAR_PIXELS = 0.01;
const PRICE_PANE_HEIGHT = 380;
const FEATURE_PANE_HEIGHT = 128;
const TIME_AXIS_HEIGHT = 28;
const LEGEND_INSET = 6;
const VOLUME_SCALE = "volume";
const VOLUME_SHARE = 0.2;
const VOLUME_OPACITY = 0.45;
const PRICE_DECIMALS = 2;
const LEGEND = "pointer-events-none absolute left-2 z-10 flex rounded bg-surface/80 px-1 text-xs tabular-nums";

export type FeatureLine = { key: string; term: string; points: SeriesPoint[] };

type Plot = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  lines: Map<string, { series: ISeriesApi<"Line">; points: SeriesPoint[] }>;
};

function atOrBefore<Row extends readonly [number, ...unknown[]]>(rows: Row[], time: number): Row | undefined {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle][0] <= time) low = middle + 1;
    else high = middle;
  }
  return rows[low - 1];
}

function spreadOf(points: SeriesPoint[]): number {
  if (points.length < 2) return 0;
  const mean = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return Math.sqrt(points.reduce((sum, point) => sum + (point[1] - mean) ** 2, 0) / (points.length - 1));
}

export function MarketChart({
  scope,
  loading,
  bars,
  lines,
  visibleDays,
}: {
  scope: string | null;
  loading: boolean;
  bars: OhlcvBar[];
  lines: FeatureLine[];
  visibleDays: number | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const plot = useRef<Plot | null>(null);
  const ranged = useRef<{ scope: string | null; visibleDays: number | null; settled: boolean } | null>(null);
  const theme = useChartTheme(container);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  const decimals = useMemo(
    () => new Map(lines.map((line) => [line.key, decimalsFor(spreadOf(line.points))])),
    [lines],
  );
  const starts = [bars[0]?.[0], ...lines.map((line) => line.points[0]?.[0])].filter((time) => time != null);
  const ends = [bars.at(-1)?.[0], ...lines.map((line) => line.points.at(-1)?.[0])].filter((time) => time != null);
  const oldest = starts.length ? Math.min(...starts) : null;
  const newest = ends.length ? Math.max(...ends) : null;

  useEffect(() => {
    const element = container.current;
    if (!element || !theme) return;
    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: theme.muted,
        fontFamily: theme.fontFamily,
        fontSize: 12,
        attributionLogo: false,
        panes: { enableResize: false, separatorColor: theme.border },
      },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: NARROWEST_BAR_PIXELS,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.muted, labelBackgroundColor: theme.text },
        horzLine: { color: theme.muted, labelBackgroundColor: theme.text },
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
      borderVisible: false,
      priceLineVisible: false,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: VOLUME_SHARE + 0.05 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: VOLUME_SCALE,
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 1 - VOLUME_SHARE, bottom: 0 } });
    chart.subscribeCrosshairMove((moved) => setHoveredTime(moved.time == null ? null : Number(moved.time)));
    plot.current = { chart, candles, volume, lines: new Map() };
    return () => {
      plot.current = null;
      ranged.current = null;
      chart.remove();
    };
  }, [theme]);

  useEffect(() => {
    if (!plot.current || !theme) return;
    const rising = toRgba(theme.up, VOLUME_OPACITY);
    const falling = toRgba(theme.down, VOLUME_OPACITY);
    plot.current.candles.setData(
      bars.map(([time, open, high, low, close]) => ({ time: time as UTCTimestamp, open, high, low, close })),
    );
    plot.current.volume.setData(
      bars.flatMap(([time, open, , , close, traded]) =>
        traded == null ? [] : [{ time: time as UTCTimestamp, value: traded, color: close >= open ? rising : falling }],
      ),
    );
  }, [theme, bars]);

  useEffect(() => {
    if (!plot.current || !theme) return;
    const { chart, lines: drawn } = plot.current;
    for (const [key, { series }] of drawn)
      if (!lines.some((line) => line.key === key)) {
        chart.removeSeries(series);
        drawn.delete(key);
      }
    lines.forEach(({ key, points }, position) => {
      const existing = drawn.get(key);
      const series =
        existing?.series ??
        chart.addSeries(LineSeries, { color: theme.primary, lineWidth: 2, priceLineVisible: false }, chart.panes().length);
      if (existing?.points !== points) {
        const places = decimals.get(key) ?? PRICE_DECIMALS;
        series.applyOptions({
          priceFormat: { type: "custom", minMove: 10 ** -places, formatter: (value: number) => scaled(value, places) },
        });
        series.setData(points.map(([time, value]) => ({ time: time as UTCTimestamp, value })));
        drawn.set(key, { series, points });
      }
      const pane = series.getPane();
      if (pane.paneIndex() !== position + 1) pane.moveTo(position + 1);
    });
    chart.panes().forEach((pane, position) => pane.setStretchFactor(position ? FEATURE_PANE_HEIGHT : PRICE_PANE_HEIGHT));
  }, [theme, lines, decimals]);

  useEffect(() => {
    if (oldest == null || newest == null) return;
    const last = ranged.current;
    if (last?.settled && last.scope === scope && last.visibleDays === visibleDays) return;
    const frame = requestAnimationFrame(() => {
      ranged.current = { scope, visibleDays, settled: !loading };
      const scale = plot.current?.chart.timeScale();
      if (visibleDays == null) scale?.fitContent();
      else
        scale?.setVisibleRange({
          from: Math.max(oldest, newest - visibleDays * SECONDS_PER_DAY) as UTCTimestamp,
          to: newest as UTCTimestamp,
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [theme, scope, loading, bars, lines, oldest, newest, visibleDays]);

  const bar = hoveredTime == null ? bars.at(-1) : atOrBefore(bars, hoveredTime);
  const readTime = hoveredTime ?? bar?.[0] ?? newest;
  const [, open, high, low, close, traded] = bar ?? [];
  const direction = close == null || open == null ? "text-muted" : close >= open ? "text-up-text" : "text-down-text";
  const prices = [
    ["O", open],
    ["H", high],
    ["L", low],
    ["C", close],
  ] as const;

  return (
    <div className="relative">
      <div
        ref={container}
        className="w-full"
        style={{ height: PRICE_PANE_HEIGHT + lines.length * FEATURE_PANE_HEIGHT + TIME_AXIS_HEIGHT }}
      />
      <div
        className={`${LEGEND} flex-wrap gap-x-3`}
        style={{ top: LEGEND_INSET }}
      >
        {readTime != null && <span className="text-muted">{utcSeconds(readTime)}</span>}
        {prices.map(([label, price]) => (
          <span key={label}>
            <span className="text-muted">{label} </span>
            <span className={direction}>{scaled(price, PRICE_DECIMALS)}</span>
          </span>
        ))}
        <span>
          <span className="text-muted">V </span>
          {compact(traded)}
        </span>
      </div>
      {lines.map((line, position) => {
        const point = hoveredTime == null ? line.points.at(-1) : atOrBefore(line.points, hoveredTime);
        return (
          <div
            key={line.key}
            className={`${LEGEND} gap-2`}
            style={{ top: PRICE_PANE_HEIGHT + position * FEATURE_PANE_HEIGHT + LEGEND_INSET }}
          >
            <span className="text-muted">{line.term}</span>
            <span>{scaled(point?.[1], decimals.get(line.key) ?? PRICE_DECIMALS)}</span>
          </div>
        );
      })}
    </div>
  );
}
