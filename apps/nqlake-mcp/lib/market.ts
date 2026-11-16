import type { FeatureTable } from "./features";
import type { MarketSymbol } from "./ohlcv";
import { type Loaded, useJson } from "./use-json";

export type MarketEntry = { symbol: string; tables: string[]; priced: boolean };

export const marketHref = (symbol: string) => `/?symbol=${encodeURIComponent(symbol)}`;

export function symbolsOf(priced: MarketSymbol[], tables: FeatureTable[]): string[] {
  const names = [...priced, ...tables.flatMap((table) => table.symbols)].map((entry) => entry.symbol);
  return [...new Set(names)].sort();
}

export function useMarketEntries(): Loaded<MarketEntry[]> {
  const symbols = useJson<MarketSymbol[]>("/api/symbols");
  const described = useJson<FeatureTable[]>("/api/features");
  const priced = symbols.data;
  const tables = described.data;
  return {
    data:
      priced && tables
        ? symbolsOf(priced, tables).map((symbol) => ({
            symbol,
            tables: tables
              .filter((table) => table.symbols.some((entry) => entry.symbol === symbol))
              .map((table) => table.table),
            priced: priced.some((entry) => entry.symbol === symbol),
          }))
        : null,
    error: symbols.error ?? described.error,
    loading: symbols.loading || described.loading,
    refresh: () => {
      symbols.refresh();
      described.refresh();
    },
  };
}
