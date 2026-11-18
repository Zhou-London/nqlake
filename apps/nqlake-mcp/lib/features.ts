import { listValue } from "@duckdb/node-api";
import { z } from "zod";
import { describeFeature, featureTerm } from "./glossary";
import { CATALOG, identifier, query } from "./lake";
import { INACTIVE_AFTER_DAYS, MAX_SYMBOLS } from "./limits";

export class InputError extends Error {}

export const NAMESPACE = "market";
const FEATURE_TABLE_SUFFIX = "_feat";
const GROUP_SEPARATOR = ".";
const ISO_SECONDS = "'%Y-%m-%dT%H:%M:%SZ'";
const NUMERIC_TYPE = /^(DOUBLE|FLOAT|DECIMAL|U?(TINY|SMALL|BIG|HUGE)?INT)/;
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
const RECENT_VALUES = 8;
const SIGNIFICANT_DIGITS = 6;
const COMPARED_DIGITS = 4;
const SECONDS_PER_DAY = 86_400;
export const NANOSECONDS_PER_SECOND = 1_000_000_000;

const PEER_SUFFIXES = { rank: "_rank", zscore: "_z" } as const;

export type Peers = { rank: string | null; zscore: string | null };
export type Feature = {
  name: string;
  term: string;
  group: string;
  type: string;
  description: string | null;
  peers: Peers | null;
};
type Column = Feature & { peerOf: string | null };
export type FeatureGroup = { group: string; features: Feature[] };
export type SymbolCoverage = { symbol: string; rows: number; first: string; last: string };
export type FeatureTable = { table: string; groups: FeatureGroup[]; symbols: SymbolCoverage[] };
export type FeatureRow = { ts: string } & Record<string, number | string | null>;
export type LatestFeatures = { table: string; symbol: string; as_of: string | null; rows: FeatureRow[] };
export type FeatureStats = {
  feature: string;
  term: string;
  description: string | null;
  current: number | null;
  percentile: number | null;
  zscore: number | null;
  peer_rank: number | null;
  peer_zscore: number | null;
  mean: number | null;
  std: number | null;
  min: number | null;
  p05: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
  max: number | null;
  observations: number;
  recent: (number | null)[];
};
export type SeriesPoint = [epochSeconds: number, value: number];
export type FeatureSeries = {
  table: string;
  symbol: string;
  as_of: string | null;
  series: { feature: string; points: SeriesPoint[] }[];
};
export type StatsReport = {
  table: string;
  symbol: string;
  as_of: string | null;
  bars: number;
  features: FeatureStats[];
};
export type Standing = [
  value: number | null,
  peerRank: number | null,
  peerZscore: number | null,
  percentile: number | null,
  zscore: number | null,
];
export type SymbolStandings = { symbol: string; as_of: string; features: Record<string, Standing> };
export type Comparison = {
  table: string;
  as_of: string | null;
  lookback: number;
  features: { feature: string; term: string }[];
  symbols: SymbolStandings[];
  inactive: { symbol: string; last: string }[];
};

const table = z.string().min(1).describe("Feature table name, as returned by list_feature_tables");
export const symbol = z.string().min(1).describe("Symbol, as listed in the table's coverage");
const group = z.string().min(1).optional().describe("Feature group to read; omit for every group");
const features = z
  .array(z.string().min(1))
  .min(1)
  .max(64)
  .optional()
  .describe("Full feature or peer column names to read; overrides group");
export const asOf = z.iso
  .datetime({ offset: true })
  .optional()
  .describe("Read only bars at or before this UTC time; omit for the newest data");
export const from = z.iso
  .datetime({ offset: true })
  .optional()
  .describe("Read only bars at or after this UTC time; omit for no lower bound");

export const tableShape = { table };
export const latestShape = {
  table,
  symbol,
  group,
  features,
  limit: z.coerce.number().int().min(1).max(200).default(20).describe("Number of newest bars to return"),
  as_of: asOf,
};
export const barsShape = {
  ...latestShape,
  limit: z.coerce.number().int().min(1).max(5000).default(500).describe("Number of newest bars to return"),
};
export const seriesShape = {
  table,
  symbol,
  group,
  features,
  limit: z.coerce.number().int().min(1).max(200_000).default(200_000).describe("Number of newest bars to return"),
  from,
  as_of: asOf,
};
const lookback = z.coerce.number().int().min(30).max(50_000).default(2000);

export const statsShape = {
  table,
  symbol,
  group,
  features,
  lookback: lookback.describe("Number of newest bars the statistics cover"),
  as_of: asOf,
};
export const compareShape = {
  table,
  group,
  features,
  symbols: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_SYMBOLS)
    .optional()
    .describe("Symbols to compare; omit for every symbol of the table"),
  sort_by: z
    .string()
    .min(1)
    .optional()
    .describe("A compared feature column, or one of its peer columns, to sort by; omit to sort by symbol"),
  order: z.enum(["desc", "asc"]).default("desc").describe("Sort order of sort_by"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SYMBOLS)
    .default(MAX_SYMBOLS)
    .describe("Number of symbols to return, after sorting"),
  lookback: lookback.describe("Number of newest bars of each symbol that its own percentile and z-score cover"),
  as_of: asOf,
};

export type BarWindow = { symbol: string; from?: string; as_of?: string };
type Columns = { table: string; group?: string; features?: string[] };
type Selection = BarWindow & Columns;
type CompareInput = z.infer<z.ZodObject<typeof compareShape>>;

export const qualified = (name: string) => `${CATALOG}.${NAMESPACE}.${identifier(name)}`;

export const isoOf = (nanoseconds: string) => `strftime(make_timestamp_ns(${nanoseconds}), ${ISO_SECONDS})`;
export const secondsOf = (nanoseconds: string) => `(${nanoseconds} / ${NANOSECONDS_PER_SECOND})::DOUBLE`;
const nanosecondsOf = (parameter: string) => `epoch_ns($${parameter}::TIMESTAMPTZ)`;
const dayOf = (parameter: string) => `make_timestamp_ns(${nanosecondsOf(parameter)})::DATE`;
const atOrBefore = (parameter: string) =>
  ` AND source.ts <= ${nanosecondsOf(parameter)} AND source.date <= ${dayOf(parameter)}`;

const finiteValue = (column: string) => {
  const value = `source.${identifier(column)}::DOUBLE`;
  return `CASE WHEN isfinite(${value}) THEN ${value} END`;
};

const finite = (column: string) => `${finiteValue(column)} AS ${identifier(column)}`;

const rounded = (value: number | null | undefined, digits = SIGNIFICANT_DIGITS) =>
  value == null || !Number.isFinite(value) ? null : Number(value.toPrecision(digits));

const zscoreOf = (current: number | null, mean: number | null, std: number | null) =>
  current != null && mean != null && std ? (current - mean) / std : null;

export async function featureTableNames(): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_catalog = $catalog AND table_schema = $namespace AND ends_with(table_name, $suffix)
     ORDER BY table_name`,
    { catalog: CATALOG, namespace: NAMESPACE, suffix: FEATURE_TABLE_SUFFIX },
  );
  return rows.map((row) => row.table_name);
}

async function columnsOf(name: string): Promise<Column[]> {
  if (!(await featureTableNames()).includes(name)) throw new InputError(`Unknown feature table: ${name}`);
  const described = await query<{ column_name: string; column_type: string }>(`DESCRIBE ${qualified(name)}`);
  const numeric = described.filter(
    (column) => column.column_name.includes(GROUP_SEPARATOR) && NUMERIC_TYPE.test(column.column_type),
  );
  const names = new Set(numeric.map((column) => column.column_name));
  const twin = (base: string, suffix: string) => (names.has(base + suffix) ? base + suffix : null);
  const peerOf = (column: string) =>
    Object.values(PEER_SUFFIXES)
      .filter((suffix) => column.endsWith(suffix))
      .map((suffix) => column.slice(0, -suffix.length))
      .find((base) => names.has(base)) ?? null;
  return numeric.map(({ column_name: column, column_type: type }) => {
    const rank = twin(column, PEER_SUFFIXES.rank);
    const zscore = twin(column, PEER_SUFFIXES.zscore);
    return {
      name: column,
      term: featureTerm(column),
      group: column.slice(0, column.indexOf(GROUP_SEPARATOR)),
      type,
      description: describeFeature(column),
      peers: rank || zscore ? { rank, zscore } : null,
      peerOf: peerOf(column),
    };
  });
}

const featureOf = ({ peerOf: _, ...feature }: Column): Feature => feature;

export const featureColumns = async (name: string) => (await columnsOf(name)).map((column) => column.name);

export const featuresOf = async (name: string) =>
  (await columnsOf(name)).filter((column) => column.peerOf == null).map(featureOf);

const withPeers = (features: Feature[]) => [
  ...new Set(
    features.flatMap((feature) => [feature.name, feature.peers?.rank, feature.peers?.zscore].filter((name) => name != null)),
  ),
];

export async function coverageIn(relation: string): Promise<SymbolCoverage[]> {
  return query<SymbolCoverage>(
    `SELECT symbol, count(*)::INTEGER AS rows,
            ${isoOf("min(ts)")} AS first, ${isoOf("max(ts)")} AS last
     FROM ${relation} GROUP BY symbol ORDER BY symbol`,
  );
}

export const coverageOf = (name: string) => coverageIn(qualified(name));

export const oneRowPerTime = <Row extends { time: number }>(ordered: Row[]) =>
  ordered.filter((row, position) => row.time !== ordered[position - 1]?.time);

export async function describeFeatureTable(name: string): Promise<FeatureTable> {
  const all = await featuresOf(name);
  const groups = [...new Set(all.map((feature) => feature.group))].map((group) => ({
    group,
    features: all.filter((feature) => feature.group === group),
  }));
  return { table: name, groups, symbols: await coverageOf(name) };
}

export async function listFeatureTables(): Promise<FeatureTable[]> {
  return Promise.all((await featureTableNames()).map(describeFeatureTable));
}

async function selected(selection: Columns): Promise<Feature[]> {
  const columns = await columnsOf(selection.table);
  if (selection.features) {
    const unknown = selection.features.filter((name) => !columns.some((column) => column.name === name));
    if (unknown.length) throw new InputError(`Unknown features in ${selection.table}: ${unknown.join(", ")}`);
    return columns.filter((column) => selection.features!.includes(column.name)).map(featureOf);
  }
  const all = columns.filter((column) => column.peerOf == null).map(featureOf);
  if (!selection.group) return all;
  const inGroup = all.filter((feature) => feature.group === selection.group);
  if (!inGroup.length) throw new InputError(`Unknown feature group in ${selection.table}: ${selection.group}`);
  return inGroup;
}

export const barWindow = ({ symbol, from, as_of }: BarWindow) => ({
  where:
    "source.symbol = $symbol" +
    (from ? ` AND source.ts >= ${nanosecondsOf("from")} AND source.date >= ${dayOf("from")}` : "") +
    (as_of ? atOrBefore("as_of") : ""),
  values: { symbol, ...(from ? { from } : {}), ...(as_of ? { as_of } : {}) },
});

export async function latestFeatures(selection: Selection & { limit: number }): Promise<LatestFeatures> {
  const columns = withPeers(await selected(selection));
  const { where, values } = barWindow(selection);
  const rows = await query<FeatureRow>(
    `SELECT ${isoOf("source.ts")} AS ts, ${columns.map(finite).join(", ")}
     FROM ${qualified(selection.table)} AS source
     WHERE ${where}
     ORDER BY source.ts DESC LIMIT $limit`,
    { ...values, limit: selection.limit },
  );
  return { table: selection.table, symbol: selection.symbol, as_of: rows[0]?.ts ?? null, rows };
}

export async function featureSeries(selection: Selection & { limit: number }): Promise<FeatureSeries> {
  const columns = await selected(selection);
  const { where, values } = barWindow(selection);
  const newestFirst = await query<{ time: number; ts: string } & Record<string, number | null>>(
    `SELECT ${secondsOf("source.ts")} AS time, ${isoOf("source.ts")} AS ts,
            ${columns.map((feature) => finite(feature.name)).join(", ")}
     FROM ${qualified(selection.table)} AS source
     WHERE ${where}
     ORDER BY source.ts DESC LIMIT $limit`,
    { ...values, limit: selection.limit },
  );
  const oldestFirst = oneRowPerTime(newestFirst.toReversed());
  return {
    table: selection.table,
    symbol: selection.symbol,
    as_of: newestFirst[0]?.ts ?? null,
    series: columns.map((feature) => ({
      feature: feature.name,
      points: oldestFirst.flatMap((bar): SeriesPoint[] => {
        const value = bar[feature.name];
        return typeof value === "number" ? [[bar.time, value]] : [];
      }),
    })),
  };
}

type StatsRow = {
  position: number;
  as_of: string | null;
  bars: number;
  current: number | null;
  observations: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  quantiles: (number | null)[] | null;
  percentile: number | null;
  recent: (number | null)[] | null;
  peer_rank: number | null;
  peer_zscore: number | null;
};

const newestOf = (column: string | null | undefined) =>
  column ? `max(CASE WHEN recency = 1 THEN ${identifier(column)} END)` : "NULL::DOUBLE";

export async function featureStats(selection: Selection & { lookback: number }): Promise<StatsReport> {
  const columns = await selected(selection);
  const { where, values } = barWindow(selection);
  const perFeature = columns.map((feature, position) => {
    const value = identifier(feature.name);
    return `SELECT ${position} AS position,
              ${isoOf("max(ts)")} AS as_of, count(*)::INTEGER AS bars,
              max(CASE WHEN recency = 1 THEN ${value} END) AS current,
              count(${value})::INTEGER AS observations,
              avg(${value}) AS mean, stddev_samp(${value}) AS std, min(${value}) AS min, max(${value}) AS max,
              quantile_cont(${value}, [${QUANTILES.join(", ")}]) AS quantiles,
              avg((${value} <= (SELECT ${value} FROM recent WHERE recency = 1))::INTEGER) AS percentile,
              list(${value} ORDER BY recency) FILTER (WHERE recency <= ${RECENT_VALUES}) AS recent,
              ${newestOf(feature.peers?.rank)} AS peer_rank, ${newestOf(feature.peers?.zscore)} AS peer_zscore
            FROM recent`;
  });
  const rows = await query<StatsRow>(
    `WITH recent AS (
       SELECT source.ts AS ts, row_number() OVER (ORDER BY source.ts DESC) AS recency,
              ${withPeers(columns).map(finite).join(", ")}
       FROM ${qualified(selection.table)} AS source
       WHERE ${where}
       ORDER BY source.ts DESC LIMIT $lookback
     )
     ${perFeature.join("\nUNION ALL\n")}
     ORDER BY position`,
    { ...values, lookback: selection.lookback },
  );

  return {
    table: selection.table,
    symbol: selection.symbol,
    as_of: rows[0]?.as_of ?? null,
    bars: rows[0]?.bars ?? 0,
    features: rows.map((row) => {
      const feature = columns[row.position];
      const [p05, p25, median, p75, p95] = row.quantiles ?? [];
      const zscore = zscoreOf(row.current, row.mean, row.std);
      return {
        feature: feature.name,
        term: feature.term,
        description: feature.description,
        current: rounded(row.current),
        percentile: rounded(row.percentile),
        zscore: rounded(zscore),
        peer_rank: rounded(row.peer_rank),
        peer_zscore: rounded(row.peer_zscore),
        mean: rounded(row.mean),
        std: rounded(row.std),
        min: rounded(row.min),
        p05: rounded(p05),
        p25: rounded(p25),
        median: rounded(median),
        p75: rounded(p75),
        p95: rounded(p95),
        max: rounded(row.max),
        observations: row.observations,
        recent: (row.recent ?? []).map((value) => rounded(value)),
      };
    }),
  };
}

type ComparedRow = { symbol: string; as_of: string; time: number } & Record<string, number | null>;

const valueOrNull = (column: string | null | undefined, alias: string) =>
  `${column ? finiteValue(column) : "NULL::DOUBLE"} AS ${alias}`;

export async function compareSymbols(selection: CompareInput): Promise<Comparison> {
  const columns = await selected(selection);
  const sortKeys = columns.flatMap((feature, position) =>
    [feature.name, feature.peers?.rank, feature.peers?.zscore].flatMap((name, part) => (name ? [{ name, position, part }] : [])),
  );
  const sortKey = selection.sort_by == null ? null : sortKeys.find((key) => key.name === selection.sort_by);
  if (sortKey === undefined) throw new InputError(`sort_by is not among the compared features: ${selection.sort_by}`);

  const rows = await query<ComparedRow>(
    `WITH recent AS (
       SELECT source.symbol AS symbol, source.ts AS ts,
              row_number() OVER (PARTITION BY source.symbol ORDER BY source.ts DESC) AS recency,
              ${columns
                .map(
                  (feature, position) =>
                    `${valueOrNull(feature.name, `f${position}`)}, ` +
                    `${valueOrNull(feature.peers?.rank, `r${position}`)}, ` +
                    `${valueOrNull(feature.peers?.zscore, `z${position}`)}`,
                )
                .join(", ")}
       FROM ${qualified(selection.table)} AS source
       WHERE true
         ${selection.symbols ? "AND list_contains($symbols, source.symbol)" : ""}
         ${selection.as_of ? atOrBefore("as_of") : ""}
       QUALIFY recency <= $lookback
     ),
     newest AS (SELECT * FROM recent WHERE recency = 1)
     SELECT recent.symbol AS symbol,
            ${isoOf("any_value(newest.ts)")} AS as_of,
            ${secondsOf("any_value(newest.ts)")} AS time,
            ${columns
              .map(
                (_, position) =>
                  `any_value(newest.f${position}) AS current${position},
                   any_value(newest.r${position}) AS rank${position},
                   any_value(newest.z${position}) AS spread${position},
                   avg((recent.f${position} <= newest.f${position})::INTEGER) AS percentile${position},
                   avg(recent.f${position}) AS mean${position},
                   stddev_samp(recent.f${position}) AS std${position}`,
              )
              .join(",\n")}
     FROM recent JOIN newest ON recent.symbol = newest.symbol
     GROUP BY recent.symbol
     ORDER BY recent.symbol`,
    {
      lookback: selection.lookback,
      ...(selection.symbols ? { symbols: listValue(selection.symbols) } : {}),
      ...(selection.as_of ? { as_of: selection.as_of } : {}),
    },
  );

  const missing = (selection.symbols ?? []).filter((name) => !rows.some((row) => row.symbol === name));
  if (missing.length) throw new InputError(`${selection.table} has no bars for: ${[...new Set(missing)].join(", ")}`);

  const newest = Math.max(...rows.map((row) => row.time));
  const isActive = (row: ComparedRow) => newest - row.time <= INACTIVE_AFTER_DAYS * SECONDS_PER_DAY;
  const compared = rows.filter(isActive).map((row) => ({
    symbol: row.symbol,
    as_of: row.as_of,
    standings: columns.map((_, position): Standing => {
      const current = row[`current${position}`];
      return [
        rounded(current, COMPARED_DIGITS),
        rounded(row[`rank${position}`], COMPARED_DIGITS),
        rounded(row[`spread${position}`], COMPARED_DIGITS),
        rounded(row[`percentile${position}`], COMPARED_DIGITS),
        rounded(zscoreOf(current, row[`mean${position}`], row[`std${position}`]), COMPARED_DIGITS),
      ];
    }),
  }));
  if (sortKey) {
    const direction = selection.order === "asc" ? 1 : -1;
    compared.sort((left, right) => {
      const a = left.standings[sortKey.position][sortKey.part];
      const b = right.standings[sortKey.position][sortKey.part];
      if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
      return (a - b) * direction;
    });
  }

  return {
    table: selection.table,
    as_of: rows.find((row) => row.time === newest)?.as_of ?? null,
    lookback: selection.lookback,
    features: columns.map((feature) => ({ feature: feature.name, term: feature.term })),
    symbols: compared.slice(0, selection.limit).map(({ symbol, as_of, standings }) => ({
      symbol,
      as_of,
      features: Object.fromEntries(columns.map((feature, position) => [feature.name, standings[position]])),
    })),
    inactive: rows.filter((row) => !isActive(row)).map((row) => ({ symbol: row.symbol, last: row.as_of })),
  };
}
