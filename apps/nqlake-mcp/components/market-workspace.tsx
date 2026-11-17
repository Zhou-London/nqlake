"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Link,
  PageContent,
  TimeRangeSelector,
} from "@nowquant/nqui";
import { ArrowLeft, CandlestickChart } from "lucide-react";
import { FeatureMenu } from "@/components/feature-menu";
import { FeatureStandings } from "@/components/feature-standings";
import { type FeatureLine, MarketChart } from "@/components/market-chart";
import { SuggestionPanel } from "@/components/suggestion-panel";
import type { FeatureTable, SeriesPoint } from "@/lib/features";
import type { MarketSymbol, Ohlcv, OhlcvBar } from "@/lib/ohlcv";
import { type CatalogFeature, featureCatalog, symbolsOf } from "@/lib/market";
import type { SuggestionView } from "@/lib/suggestions";
import { useFeatureSeries, useHeld, useJson } from "@/lib/use-json";

const RANGES = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 91 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
];
const DEFAULT_RANGE = "3m";
const DEFAULT_FEATURE_COUNT = 2;
const SECONDS_PER_DAY = 86_400;
const NO_BARS: OhlcvBar[] = [];
const NO_POINTS: SeriesPoint[] = [];
const NO_FEATURES: CatalogFeature[] = [];

const daysOf = (range: string) => RANGES.find((option) => option.id === range)?.days ?? null;

const wider = (range: string, than: string) => (daysOf(range) ?? Infinity) > (daysOf(than) ?? Infinity);

const seconds = (instant: string) => Date.parse(instant) / 1000;

const catalogOf = (tables: FeatureTable[], symbol: string) =>
  featureCatalog(tables.filter((table) => table.symbols.some((entry) => entry.symbol === symbol)));

function newestBar(priced: MarketSymbol[], tables: FeatureTable[], symbol: string): number | null {
  const ends = [...priced, ...tables.flatMap((table) => table.symbols)]
    .filter((entry) => entry.symbol === symbol)
    .map((entry) => seconds(entry.last));
  return ends.length ? Math.max(...ends) : null;
}

export function MarketWorkspace({ symbol: requested }: { symbol: string }) {
  const symbols = useJson<MarketSymbol[]>("/api/symbols");
  const described = useJson<FeatureTable[]>("/api/features");
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [span, setSpan] = useState(DEFAULT_RANGE);
  const [chosenKeys, setChosenKeys] = useState<string[] | null>(null);

  const listed = !symbols.loading && !described.loading;
  const priced = symbols.data;
  const tables = described.data;
  const symbolNames = useMemo(() => (listed ? symbolsOf(priced ?? [], tables ?? []) : []), [listed, priced, tables]);
  const symbol = symbolNames.includes(requested) ? requested : null;
  const catalog = useMemo(() => (symbol ? catalogOf(tables ?? [], symbol) : NO_FEATURES), [tables, symbol]);
  const newest = useMemo(() => (symbol ? newestBar(priced ?? [], tables ?? [], symbol) : null), [priced, tables, symbol]);
  const spanDays = daysOf(span);
  const from =
    newest == null || spanDays == null ? undefined : new Date((newest - spanDays * SECONDS_PER_DAY) * 1000).toISOString();
  const selection = symbol ? `symbol=${encodeURIComponent(symbol)}` : null;

  const hasBars = symbol != null && (priced ?? []).some((entry) => entry.symbol === symbol);
  const ohlcv = useJson<Ohlcv>(
    hasBars ? `/api/ohlcv?${selection}${from ? `&from=${encodeURIComponent(from)}` : ""}` : null,
  );
  const bars = useHeld(symbol, ohlcv.data)?.bars ?? NO_BARS;

  const suggestions = useJson<SuggestionView[]>(selection && `/api/suggestions?${selection}`);
  const suggestion = suggestions.data?.[0];
  const suggestionSettled = suggestions.data != null || suggestions.error != null;
  const charted = useMemo(() => {
    if (chosenKeys) return catalog.filter((feature) => chosenKeys.includes(feature.key));
    if (!suggestionSettled) return NO_FEATURES;
    const cited = catalog.filter(
      (feature) =>
        suggestion?.features.includes(feature.name) && suggestion.sources.some((read) => read.table === feature.table),
    );
    return cited.length ? cited : catalog.slice(0, DEFAULT_FEATURE_COUNT);
  }, [chosenKeys, catalog, suggestionSettled, suggestion]);
  const chartedKeys = useMemo(() => charted.map((feature) => feature.key), [charted]);

  const series = useFeatureSeries(symbol, from, charted);
  const lines = useMemo<FeatureLine[]>(
    () =>
      charted.map((feature) => ({
        key: feature.key,
        term: feature.term,
        points: series.held[feature.key]?.points ?? NO_POINTS,
      })),
    [charted, series.held],
  );
  const seriesWindow = from ?? "";
  const loading =
    ohlcv.loading || !suggestionSettled || charted.some((feature) => series.held[feature.key]?.window !== seriesWindow);

  const coveringTables = useMemo(() => [...new Set(catalog.map((feature) => feature.table))], [catalog]);
  const errors = [...new Set([symbols.error, described.error, ohlcv.error, series.error].filter((error) => error != null))];

  const chooseRange = (next: string) => {
    setRange(next);
    if (wider(next, span)) setSpan(next);
  };
  const toggleFeature = (key: string) =>
    setChosenKeys(chartedKeys.includes(key) ? chartedKeys.filter((other) => other !== key) : [...chartedKeys, key]);

  return (
    <PageContent className="max-w-none! gap-4">
      {errors.map((error) => (
        <Alert key={error} color="warning" title={error} />
      ))}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader className="flex-wrap items-center">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" variant="foreground" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
              <CardTitle>{requested}</CardTitle>
              <TimeRangeSelector aria-label="Range" size="sm" options={RANGES} value={range} onChange={chooseRange} />
            </div>
            <FeatureMenu catalog={catalog} chosen={chartedKeys} onChange={setChosenKeys} />
          </CardHeader>
          <CardBody>
            {listed && !symbol ? (
              <EmptyState icon={<CandlestickChart />} title="Unknown symbol" />
            ) : (
              <MarketChart
                scope={symbol && symbol + seriesWindow}
                loading={loading}
                bars={bars}
                lines={lines}
                visibleDays={daysOf(range)}
              />
            )}
          </CardBody>
        </Card>
        <SuggestionPanel suggestions={suggestions} />
      </div>
      {symbol && coveringTables.length > 0 && (
        <FeatureStandings symbol={symbol} tables={coveringTables} charted={chartedKeys} onToggle={toggleFeature} />
      )}
    </PageContent>
  );
}
