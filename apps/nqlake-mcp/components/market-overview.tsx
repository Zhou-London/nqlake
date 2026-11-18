"use client";

import { type Key, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionItem,
  Alert,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Chip,
  DeltaChip,
  EmptyState,
  IconButton,
  PageContent,
  PriceText,
  ProgressBar,
  SearchField,
  Select,
  SelectItem,
  Skeleton,
  Sparkline,
  ToggleButton,
} from "@nowquant/nqui";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CandlestickChart, CircleDashed, Layers } from "lucide-react";
import { FeatureMenu } from "@/components/feature-menu";
import { STANCES } from "@/components/suggestion-panel";
import type { Comparison, FeatureTable, Standing } from "@/lib/features";
import { decimalsFor, scaled, utc } from "@/lib/format";
import { INACTIVE_AFTER_DAYS } from "@/lib/limits";
import { type CatalogFeature, entriesOf, featureCatalog, marketHref, overviewHref, overviewView } from "@/lib/market";
import type { CloseTrail, MarketSymbol } from "@/lib/ohlcv";
import type { SuggestionView } from "@/lib/suggestions";
import { featureKey, useJson, useJsonList } from "@/lib/use-json";

const THUMBNAIL_BARS = 240;
const THUMBNAIL_HEIGHT = 64;
const DEFAULT_FEATURES = ["ta_ohlcv.rsi", "ta_ohlcv.ema_dev", "ta_ohlcv.natr", "ta_ohlcv.rvol"];
const EXTREME_ZSCORE = 2;
const INACTIVE_AFTER_MS = INACTIVE_AFTER_DAYS * 86_400_000;
const BY_SYMBOL = "symbol";
const BY_CHANGE = "change";
const BY_RANGE_CHANGE = "range";
const BY_CONFIDENCE = "confidence";
const STANCE_ORDER = ["bullish", "neutral", "bearish"] as const;
const UNSUGGESTED_KEY = "none";
const UNSUGGESTED = { label: "No suggestion", color: "neutral", icon: <CircleDashed /> } as const;
const PLACEHOLDER_CARDS = 12;

type Thumbnail = {
  symbol: string;
  as_of: string | null;
  close: number | null;
  change: number | null;
  rangeChange: number | null;
  closes: number[];
  stance: SuggestionView["stance"] | undefined;
  confidence: number | null;
  standings: Record<string, Standing>;
};
type Readout = CatalogFeature & { decimals: number };

const spreadOf = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};

const ratio = (to: number | null | undefined, from: number | null | undefined) =>
  to != null && from ? to / from - 1 : null;

function sortValue(thumbnail: Thumbnail, sortBy: string): number | string | null {
  if (sortBy === BY_SYMBOL) return thumbnail.symbol;
  if (sortBy === BY_CHANGE) return thumbnail.change;
  if (sortBy === BY_RANGE_CHANGE) return thumbnail.rangeChange;
  if (sortBy === BY_CONFIDENCE) return thumbnail.confidence;
  return thumbnail.standings[sortBy]?.[0] ?? null;
}

function sorted(thumbnails: Thumbnail[], sortBy: string, descending: boolean): Thumbnail[] {
  const direction = descending ? -1 : 1;
  return thumbnails.toSorted((left, right) => {
    const a = sortValue(left, sortBy);
    const b = sortValue(right, sortBy);
    if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
    return (typeof a === "string" ? a.localeCompare(String(b)) : a - Number(b)) * direction;
  });
}

function FeatureReadout({ feature, standing }: { feature: Readout; standing: Standing | undefined }) {
  const [value, peerRank, , , zscore] = standing ?? [];
  const extreme = zscore != null && Math.abs(zscore) >= EXTREME_ZSCORE;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="min-w-0 flex-1 truncate text-muted" title={feature.description ?? feature.term}>
        {feature.term}
      </span>
      <span className={`w-14 text-right tabular-nums ${extreme ? "font-semibold text-warning-text" : "text-foreground"}`}>
        {scaled(value, feature.decimals)}
      </span>
      {peerRank == null ? (
        <span className="w-12" />
      ) : (
        <ProgressBar
          aria-label={`${feature.term} peer rank`}
          size="sm"
          showValue={false}
          value={peerRank * 100}
          className="w-12"
        />
      )}
    </div>
  );
}

function SymbolThumbnail({ thumbnail, readouts }: { thumbnail: Thumbnail; readouts: Readout[] }) {
  const stance = thumbnail.stance && STANCES[thumbnail.stance];
  return (
    <Card href={marketHref(thumbnail.symbol)} aria-label={thumbnail.symbol}>
      <CardHeader className="items-center">
        <CardTitle>{thumbnail.symbol}</CardTitle>
        {stance && (
          <Chip size="sm" color={stance.color} startContent={stance.icon}>
            {stance.label}
          </Chip>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-center gap-2 tabular-nums">
          {thumbnail.close != null && <PriceText value={thumbnail.close} className="font-medium text-lg" />}
          {thumbnail.change != null && <DeltaChip size="sm" value={thumbnail.change} />}
          {thumbnail.rangeChange != null && (
            <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-muted text-xs">
              {THUMBNAIL_BARS} bars
              <DeltaChip size="sm" variant="text" value={thumbnail.rangeChange} />
            </span>
          )}
        </div>
        {thumbnail.closes.length > 1 ? (
          <Sparkline data={thumbnail.closes} width="100%" height={THUMBNAIL_HEIGHT} color="auto" area />
        ) : (
          <div style={{ height: THUMBNAIL_HEIGHT }} />
        )}
        {readouts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {readouts.map((feature) => (
              <FeatureReadout key={feature.key} feature={feature} standing={thumbnail.standings[feature.key]} />
            ))}
          </div>
        )}
      </CardBody>
      {thumbnail.as_of && <CardFooter className="text-muted text-xs">{utc(thumbnail.as_of)}</CardFooter>}
    </Card>
  );
}

function ThumbnailGrid({ thumbnails, readouts }: { thumbnails: Thumbnail[]; readouts: Readout[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
      {thumbnails.map((thumbnail) => (
        <SymbolThumbnail key={thumbnail.symbol} thumbnail={thumbnail} readouts={readouts} />
      ))}
    </div>
  );
}

export function MarketOverview() {
  const params = useSearchParams();
  const [view] = useState(() => overviewView(params));
  const symbols = useJson<MarketSymbol[]>("/api/symbols");
  const described = useJson<FeatureTable[]>("/api/features");
  const closes = useJson<CloseTrail[]>(`/api/closes?limit=${THUMBNAIL_BARS}`);
  const suggestions = useJson<SuggestionView[]>("/api/suggestions");
  const [chosenKeys, setChosenKeys] = useState(view.features);
  const [search, setSearch] = useState(view.search);
  const [sortBy, setSortBy] = useState(view.sortBy ?? BY_SYMBOL);
  const [descending, setDescending] = useState(view.descending);
  const [grouped, setGrouped] = useState(view.grouped);
  const [collapsed, setCollapsed] = useState(view.collapsed);

  useEffect(() => {
    const href = overviewHref({
      search,
      sortBy: sortBy === BY_SYMBOL ? null : sortBy,
      descending,
      features: chosenKeys,
      grouped,
      collapsed,
    });
    if (href !== window.location.pathname + window.location.search) window.history.replaceState(null, "", href);
  }, [search, sortBy, descending, chosenKeys, grouped, collapsed]);

  const catalog = useMemo(() => featureCatalog(described.data ?? []), [described.data]);
  const chosen = useMemo(() => {
    if (chosenKeys) return catalog.filter((feature) => chosenKeys.includes(feature.key));
    const preset = catalog.filter((feature) => DEFAULT_FEATURES.includes(feature.name));
    return preset.length ? preset : catalog.slice(0, DEFAULT_FEATURES.length);
  }, [catalog, chosenKeys]);
  const tables = [...new Set(chosen.map((feature) => feature.table))];
  const comparisons = useJsonList<Comparison>(
    tables.map(
      (table) =>
        `/api/features/${encodeURIComponent(table)}/compare?features=` +
        chosen
          .filter((feature) => feature.table === table)
          .map((feature) => encodeURIComponent(feature.name))
          .join(","),
    ),
  );

  const thumbnails = useMemo<Thumbnail[]>(() => {
    if (!symbols.data || !described.data) return [];
    const trails = new Map((closes.data ?? []).map((trail) => [trail.symbol, trail]));
    const suggested = new Map((suggestions.data ?? []).map((suggestion) => [suggestion.symbol, suggestion]));
    const standings = new Map<string, Record<string, Standing>>();
    for (const comparison of comparisons.data ?? [])
      for (const entry of comparison.symbols)
        for (const [name, standing] of Object.entries(entry.features))
          standings.set(entry.symbol, { ...standings.get(entry.symbol), [featureKey(comparison.table, name)]: standing });
    const listed = entriesOf(symbols.data, described.data).map(({ symbol }) => {
      const trail = trails.get(symbol);
      return {
        symbol,
        as_of: trail?.as_of ?? null,
        close: trail?.closes.at(-1) ?? null,
        change: ratio(trail?.closes.at(-1), trail?.closes.at(-2)),
        rangeChange: ratio(trail?.closes.at(-1), trail?.closes[0]),
        closes: trail?.closes ?? [],
        stance: suggested.get(symbol)?.stance,
        confidence: suggested.get(symbol)?.confidence ?? null,
        standings: standings.get(symbol) ?? {},
      };
    });
    const newest = Math.max(...listed.map((thumbnail) => (thumbnail.as_of ? Date.parse(thumbnail.as_of) : -Infinity)));
    return listed.filter((thumbnail) => !thumbnail.as_of || newest - Date.parse(thumbnail.as_of) <= INACTIVE_AFTER_MS);
  }, [symbols.data, described.data, closes.data, suggestions.data, comparisons.data]);

  const readouts = useMemo<Readout[]>(
    () =>
      chosen.map((feature) => ({
        ...feature,
        decimals: decimalsFor(spreadOf(thumbnails.flatMap((thumbnail) => thumbnail.standings[feature.key]?.[0] ?? []))),
      })),
    [chosen, thumbnails],
  );

  const sortOptions = [
    { id: BY_SYMBOL, label: "Symbol" },
    { id: BY_CHANGE, label: "Last bar change" },
    { id: BY_RANGE_CHANGE, label: `${THUMBNAIL_BARS}-bar change` },
    { id: BY_CONFIDENCE, label: "Confidence" },
    ...chosen.map((feature) => ({ id: feature.key, label: feature.term })),
  ];
  const activeSort = sortOptions.some((option) => option.id === sortBy) ? sortBy : BY_SYMBOL;
  const activeDescending = activeSort === sortBy && descending;
  const sortOn = (next: string) => {
    setSortBy(next);
    setDescending(next !== BY_SYMBOL);
  };
  const chooseFeatures = (keys: string[]) => {
    setChosenKeys(keys);
    if (catalog.some((feature) => feature.key === sortBy) && !keys.includes(sortBy)) sortOn(BY_SYMBOL);
  };
  const query = search.trim().toUpperCase();
  const shown = sorted(
    thumbnails.filter((thumbnail) => thumbnail.symbol.includes(query)),
    activeSort,
    activeDescending,
  );
  const groups = [...STANCE_ORDER, null]
    .map((stance) => ({
      key: stance ?? UNSUGGESTED_KEY,
      heading: stance ? STANCES[stance] : UNSUGGESTED,
      members: shown.filter((thumbnail) => (thumbnail.stance ?? null) === stance),
    }))
    .filter((group) => group.members.length > 0);
  const expandGroups = (expanded: Set<Key>) =>
    setCollapsed([
      ...collapsed.filter((key) => !groups.some((group) => group.key === key)),
      ...groups.filter((group) => !expanded.has(group.key)).map((group) => group.key),
    ]);
  const loading = symbols.loading || described.loading;
  const errors = [
    ...new Set(
      [symbols.error, described.error, closes.error, comparisons.error, suggestions.error].filter((error) => error != null),
    ),
  ];

  return (
    <PageContent className="max-w-none! gap-4">
      {errors.map((error) => (
        <Alert key={error} color="warning" title={error} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField aria-label="Search symbols" placeholder="Search" value={search} onChange={setSearch} className="w-56" />
        <span className="text-muted text-sm tabular-nums">{shown.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <ToggleButton
            aria-label="Group by stance"
            size="sm"
            isIconOnly
            isSelected={grouped}
            onChange={setGrouped}
          >
            <Layers />
          </ToggleButton>
          <Select
            aria-label="Sort by"
            size="sm"
            className="w-52"
            items={sortOptions}
            value={activeSort}
            onChange={(key) => sortOn(String(key ?? BY_SYMBOL))}
          >
            {(option) => <SelectItem id={option.id}>{option.label}</SelectItem>}
          </Select>
          <IconButton
            aria-label={activeDescending ? "Sort ascending" : "Sort descending"}
            size="sm"
            onPress={() => {
              setSortBy(activeSort);
              setDescending(!activeDescending);
            }}
          >
            {activeDescending ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
          </IconButton>
          <FeatureMenu catalog={catalog} chosen={chosen.map((feature) => feature.key)} onChange={chooseFeatures} />
        </div>
      </div>
      {loading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
          {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-xl" />
          ))}
        </div>
      )}
      {grouped ? (
        <Accordion
          allowsMultipleExpanded
          expandedKeys={groups.filter((group) => !collapsed.includes(group.key)).map((group) => group.key)}
          onExpandedChange={expandGroups}
        >
          {groups.map((group) => (
            <AccordionItem
              key={group.key}
              id={group.key}
              title={
                <span className="flex items-center gap-2">
                  <Chip color={group.heading.color} startContent={group.heading.icon}>
                    {group.heading.label}
                  </Chip>
                  <span className="text-muted tabular-nums">{group.members.length}</span>
                </span>
              }
            >
              <ThumbnailGrid thumbnails={group.members} readouts={readouts} />
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <ThumbnailGrid thumbnails={shown} readouts={readouts} />
      )}
      {!loading && shown.length === 0 && (
        <Card>
          <EmptyState icon={<CandlestickChart />} title="No symbols" />
        </Card>
      )}
    </PageContent>
  );
}
