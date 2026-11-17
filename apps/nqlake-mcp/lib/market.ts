import type { Feature, FeatureTable } from "./features";
import type { MarketSymbol } from "./ohlcv";
import { featureKey, type Loaded, useJson } from "./use-json";

export type MarketEntry = { symbol: string; tables: string[]; priced: boolean };
export type CatalogFeature = Feature & { table: string; key: string };

export type OverviewView = {
  search: string;
  sortBy: string | null;
  descending: boolean;
  features: string[] | null;
  grouped: boolean;
  collapsed: string[];
};

export const marketHref = (symbol: string) => `/?symbol=${encodeURIComponent(symbol)}`;

export function overviewHref(view: OverviewView): string {
  const params = new URLSearchParams();
  if (view.search) params.set("q", view.search);
  if (view.sortBy) params.set("sort", view.sortBy);
  if (view.descending) params.set("desc", "1");
  if (view.features) params.set("features", view.features.join(","));
  if (!view.grouped) params.set("group", "none");
  if (view.collapsed.length) params.set("collapsed", view.collapsed.join(","));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function overviewView(params: URLSearchParams): OverviewView {
  const features = params.get("features");
  return {
    search: params.get("q") ?? "",
    sortBy: params.get("sort"),
    descending: params.get("desc") === "1",
    features: features == null ? null : features.split(",").filter(Boolean),
    grouped: params.get("group") !== "none",
    collapsed: (params.get("collapsed") ?? "").split(",").filter(Boolean),
  };
}

export function symbolsOf(priced: MarketSymbol[], tables: FeatureTable[]): string[] {
  const names = [...priced, ...tables.flatMap((table) => table.symbols)].map((entry) => entry.symbol);
  return [...new Set(names)].sort();
}

export const entriesOf = (priced: MarketSymbol[], tables: FeatureTable[]): MarketEntry[] =>
  symbolsOf(priced, tables).map((symbol) => ({
    symbol,
    tables: tables.filter((table) => table.symbols.some((entry) => entry.symbol === symbol)).map((table) => table.table),
    priced: priced.some((entry) => entry.symbol === symbol),
  }));

export const featureCatalog = (tables: FeatureTable[]): CatalogFeature[] =>
  tables.flatMap(({ table, groups }) =>
    groups.flatMap((group) => group.features.map((feature) => ({ ...feature, table, key: featureKey(table, feature.name) }))),
  );

export function useMarketEntries(): Loaded<MarketEntry[]> {
  const symbols = useJson<MarketSymbol[]>("/api/symbols");
  const described = useJson<FeatureTable[]>("/api/features");
  return {
    data: symbols.data && described.data ? entriesOf(symbols.data, described.data) : null,
    error: symbols.error ?? described.error,
    loading: symbols.loading || described.loading,
    refresh: () => {
      symbols.refresh();
      described.refresh();
    },
  };
}
