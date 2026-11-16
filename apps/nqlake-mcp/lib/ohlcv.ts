import { z } from "zod";
import {
  asOf,
  barWindow,
  type BarWindow,
  coverageIn,
  coverageOf,
  featureTableNames,
  from,
  InputError,
  ISO_SECONDS,
  NAMESPACE,
  oneRowPerTime,
  qualified,
  symbol,
  type SymbolCoverage,
} from "./features";
import { CATALOG, query } from "./lake";

const OHLCV_TABLE = "us_equity_ohlcv";
const PRICES = ["open", "high", "low", "close"] as const;
const BAR_SECONDS_BY_RTYPE = { 32: 1, 33: 60, 34: 3600, 35: 86_400 };
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const PRICE_UNITS_PER_ONE = 1_000_000_000;
const UNDEFINED_PRICE = "9223372036854775807";
const BAR_SECONDS = `CASE rtype ${Object.entries(BAR_SECONDS_BY_RTYPE)
  .map(([rtype, seconds]) => `WHEN ${rtype} THEN ${seconds}`)
  .join(" ")} END`;
const BARS_AT_CLOSE = `(
  SELECT symbol, to_timestamp(ts_event // ${NANOSECONDS_PER_SECOND} + ${BAR_SECONDS}) AS ts,
         ${PRICES.map((price) => `nullif(${price}, ${UNDEFINED_PRICE}) / ${PRICE_UNITS_PER_ONE} AS ${price}`).join(", ")},
         volume
  FROM ${qualified(OHLCV_TABLE)}
  WHERE rtype IN (${Object.keys(BAR_SECONDS_BY_RTYPE).join(", ")})
)`;

export type OhlcvBar = [
  epochSeconds: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | null,
];
export type Ohlcv = { symbol: string; as_of: string | null; bars: OhlcvBar[] };
export type TableCoverage = Omit<SymbolCoverage, "symbol"> & { table: string };
export type MarketSymbol = SymbolCoverage & { tables: TableCoverage[] };

export const ohlcvShape = {
  symbol: symbol.describe("Symbol, as listed in a feature table's coverage"),
  limit: z.coerce.number().int().min(1).max(200).default(20).describe("Number of newest bars to return"),
  as_of: asOf,
};
export const candlesShape = {
  ...ohlcvShape,
  limit: z.coerce.number().int().min(1).max(200_000).default(200_000).describe("Number of newest bars to return"),
  from,
};

type StoredBar = { time: number; ts: string; open: number; high: number; low: number; close: number; volume: number | null };

async function requireOhlcvTable(): Promise<void> {
  const found = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_catalog = $catalog AND table_schema = $namespace AND table_name = $table`,
    { catalog: CATALOG, namespace: NAMESPACE, table: OHLCV_TABLE },
  );
  if (!found.length) throw new InputError(`The lake has no table ${NAMESPACE}.${OHLCV_TABLE}`);
}

export async function ohlcvBars(selection: BarWindow & { limit: number }): Promise<Ohlcv> {
  await requireOhlcvTable();
  const { where, values } = barWindow(selection);
  const newestFirst = await query<StoredBar>(
    `SELECT epoch(source.ts::TIMESTAMPTZ)::DOUBLE AS time, strftime(source.ts, ${ISO_SECONDS}) AS ts,
            ${PRICES.map((price) => `source.${price}`).join(", ")}, source.volume::DOUBLE AS volume
     FROM ${BARS_AT_CLOSE} AS source
     WHERE ${where} AND ${PRICES.map((price) => `source.${price} IS NOT NULL`).join(" AND ")}
     ORDER BY source.ts DESC LIMIT $limit`,
    { ...values, limit: selection.limit },
  );
  return {
    symbol: selection.symbol,
    as_of: newestFirst[0]?.ts ?? null,
    bars: oneRowPerTime(newestFirst.toReversed()).map((bar) => [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume]),
  };
}

export async function marketSymbols(): Promise<MarketSymbol[]> {
  await requireOhlcvTable();
  const tables = await featureTableNames();
  const [priced, ...covered] = await Promise.all([coverageIn(BARS_AT_CLOSE), ...tables.map(coverageOf)]);
  return priced.map((entry) => ({
    ...entry,
    tables: tables.flatMap((table, position) =>
      covered[position]
        .filter((coverage) => coverage.symbol === entry.symbol)
        .map(({ rows, first, last }) => ({ table, rows, first, last })),
    ),
  }));
}
