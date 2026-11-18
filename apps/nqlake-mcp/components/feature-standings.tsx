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
import type { FeatureSeries, FeatureStats, StatsReport } from "@/lib/features";
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
};

function standingsOf(reports: StatsReport[], recent: FeatureSeries[]): Standing[] {
  const trends = new Map(
    recent.flatMap(({ table, series }) =>
      series.map(({ feature, points }) => [featureKey(table, feature), points.map((point) => point[1])]),
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
  const standings = useMemo(
    () => (stats.data ? standingsOf(stats.data, recent.data ?? []) : NO_STANDINGS),
    [stats.data, recent.data],
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
    const zscore = (id: "zscore" | "peer_zscore", header: string): DataGridColumn<Standing> => ({
      id,
      header,
      accessorFn: (row) => row[id],
      cell: ({ row }) => (
        <span className={row[id] != null && Math.abs(row[id]) >= EXTREME_ZSCORE ? "font-semibold text-warning-text" : undefined}>
          {signed(row[id], 2)}
        </span>
      ),
      numeric: true,
      align: "end",
      size: 104,
    });
    const share = (id: "percentile" | "peer_rank", header: string): DataGridColumn<Standing> => ({
      id,
      header,
      accessorFn: (row) => row[id],
      size: 150,
      cell: ({ row }) =>
        row[id] == null ? "—" : <ProgressBar aria-label={header} size="sm" showValue value={row[id] * 100} className="w-28" />,
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
      share("percentile", "Percentile"),
      zscore("zscore", "Z-score"),
      share("peer_rank", "Peer rank"),
      zscore("peer_zscore", "Peer Z"),
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

  const error = stats.error ?? recent.error;
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
