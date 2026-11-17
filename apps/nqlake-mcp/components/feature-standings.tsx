"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DataGrid,
  type DataGridColumn,
  ProgressBar,
  Sparkline,
  TimeRangeSelector,
  Tooltip,
  TooltipTrigger,
  trendOf,
} from "@nowquant/nqui";
import type { Comparison, FeatureSeries, FeatureStats, StatsReport } from "@/lib/features";
import { decimalsFor, scaled, signed } from "@/lib/format";
import { featureKey, useJsonList } from "@/lib/use-json";

const WINDOWS = [
  { id: "500", label: "500 bars" },
  { id: "2000", label: "2K bars" },
  { id: "5000", label: "5K bars" },
];
const EXTREME_ZSCORE = 2;
const TREND_BARS = 120;
const TREND_TEXT = { up: "text-up-text", down: "text-down-text", flat: "text-muted" } as const;
const NO_STANDINGS: Standing[] = [];

type Standing = FeatureStats & {
  key: string;
  change: number | null;
  decimals: number;
  trend: number[];
  peers: number | null;
};

function standingsOf(symbol: string, reports: StatsReport[], recent: FeatureSeries[], compared: Comparison[]): Standing[] {
  const trends = new Map(
    recent.flatMap(({ table, series }) =>
      series.map(({ feature, points }) => [featureKey(table, feature), points.map((point) => point[1])]),
    ),
  );
  const peers = new Map(
    compared.flatMap(({ table, symbols }) =>
      Object.entries(symbols.find((entry) => entry.symbol === symbol)?.features ?? {}).map(([feature, standing]) => [
        featureKey(table, feature),
        standing[1],
      ]),
    ),
  );
  return reports.flatMap((report) =>
    report.features.map((feature) => {
      const [newest, previous] = feature.recent;
      const key = featureKey(report.table, feature.feature);
      return {
        ...feature,
        key,
        change: newest != null && previous != null ? newest - previous : null,
        decimals: decimalsFor(feature.std),
        trend: trends.get(key) ?? [],
        peers: peers.get(key) ?? null,
      };
    }),
  );
}

export function FeatureStandings({
  symbol,
  tables,
  charted,
  onToggle,
}: {
  symbol: string;
  tables: string[];
  charted: string[];
  onToggle: (feature: string) => void;
}) {
  const [lookback, setLookback] = useState(WINDOWS[1].id);
  const toggle = useRef(onToggle);
  const endpoints = tables.map((table) => `/api/features/${encodeURIComponent(table)}`);
  const selection = `symbol=${encodeURIComponent(symbol)}`;
  const stats = useJsonList<StatsReport>(endpoints.map((endpoint) => `${endpoint}/stats?${selection}&lookback=${lookback}`));
  const recent = useJsonList<FeatureSeries>(endpoints.map((endpoint) => `${endpoint}/series?${selection}&limit=${TREND_BARS}`));
  const compared = useJsonList<Comparison>(endpoints.map((endpoint) => `${endpoint}/compare?lookback=${lookback}`));
  const standings = useMemo(
    () => (stats.data ? standingsOf(symbol, stats.data, recent.data ?? [], compared.data ?? []) : NO_STANDINGS),
    [symbol, stats.data, recent.data, compared.data],
  );

  useEffect(() => {
    toggle.current = onToggle;
  });

  const columns = useMemo<DataGridColumn<Standing>[]>(() => {
    const level = (id: "current" | "p05" | "median" | "p95", header: string): DataGridColumn<Standing> => ({
      id,
      header,
      accessorFn: (row) => row[id],
      cell: ({ row }) => scaled(row[id], row.decimals),
      numeric: true,
      align: "end",
      size: 104,
    });
    return [
      {
        id: "feature",
        header: "Feature",
        accessorFn: (row) => row.term,
        size: 260,
        cell: ({ row }) => {
          const name = (
            <Button variant="link" color="neutral" size="sm" onPress={() => toggle.current(row.key)}>
              {row.term}
            </Button>
          );
          return row.description ? (
            <TooltipTrigger delay={300}>
              {name}
              <Tooltip>{row.description}</Tooltip>
            </TooltipTrigger>
          ) : (
            name
          );
        },
      },
      level("current", "Last"),
      {
        id: "change",
        header: "Chg",
        accessorFn: (row) => row.change,
        cell: ({ row }) => (
          <span className={TREND_TEXT[trendOf(row.change, 0.5 * 10 ** -row.decimals)]}>{signed(row.change, row.decimals)}</span>
        ),
        numeric: true,
        align: "end",
        size: 104,
      },
      {
        id: "percentile",
        header: "Percentile",
        accessorFn: (row) => row.percentile,
        size: 150,
        cell: ({ row }) =>
          row.percentile == null ? (
            "—"
          ) : (
            <ProgressBar aria-label="Percentile" size="sm" showValue value={row.percentile * 100} className="w-28" />
          ),
      },
      {
        id: "peers",
        header: "Peer percentile",
        accessorFn: (row) => row.peers,
        size: 150,
        cell: ({ row }) =>
          row.peers == null ? (
            "—"
          ) : (
            <ProgressBar aria-label="Peer percentile" size="sm" showValue value={row.peers * 100} className="w-28" />
          ),
      },
      {
        id: "zscore",
        header: "Z-score",
        accessorFn: (row) => row.zscore,
        cell: ({ row }) => (
          <span className={row.zscore != null && Math.abs(row.zscore) >= EXTREME_ZSCORE ? "font-semibold text-warning-text" : undefined}>
            {signed(row.zscore, 2)}
          </span>
        ),
        numeric: true,
        align: "end",
        size: 104,
      },
      {
        id: "trend",
        header: "Trend",
        enableSorting: false,
        size: 130,
        cell: ({ row }) => (row.trend.length > 1 ? <Sparkline data={row.trend} width={104} height={24} color="primary" /> : "—"),
      },
      level("p05", "P5"),
      level("median", "Median"),
      level("p95", "P95"),
    ];
  }, []);

  const error = stats.error ?? recent.error ?? compared.error;
  return (
    <Card>
      {error && <Alert color="warning" title={error} />}
      <DataGrid
        aria-label="Feature statistics"
        bare
        density="compact"
        columns={columns}
        data={standings}
        getRowId={(row) => row.key}
        rowClassName={(row) => (charted.includes(row.key) ? "bg-primary-soft" : undefined)}
        isLoading={stats.loading}
        loadingRows={8}
        toolbar={{
          title: "Feature statistics",
          search: false,
          filters: false,
          columns: false,
          end: <TimeRangeSelector aria-label="Lookback" size="sm" options={WINDOWS} value={lookback} onChange={setLookback} />,
        }}
      />
    </Card>
  );
}
