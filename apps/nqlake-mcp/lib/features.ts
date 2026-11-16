import { z } from "zod";
import { describeFeature, featureTerm } from "./glossary";
import { CATALOG, identifier, query } from "./lake";

export class InputError extends Error {}

export const NAMESPACE = "market";
const FEATURE_TABLE_SUFFIX = "_feat";
const GROUP_SEPARATOR = ".";
export const ISO_SECONDS = "'%Y-%m-%dT%H:%M:%SZ'";
const NUMERIC_TYPE = /^(DOUBLE|FLOAT|DECIMAL|U?(TINY|SMALL|BIG|HUGE)?INT)/;
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
const RECENT_VALUES = 8;
const SIGNIFICANT_DIGITS = 6;

export type Feature = { name: string; term: string; group: string; type: string; description: string | null };
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

const table = z.string().min(1).describe("Feature table name, as returned by list_feature_tables");
export const symbol = z.string().min(1).describe("Symbol, as listed in the table's coverage");
const group = z.string().min(1).optional().describe("Feature group to read; omit for every group");
const features = z
  .array(z.string().min(1))
  .min(1)
  .max(64)
  .optional()
  .describe("Full feature column names to read; overrides group");
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
export const statsShape = {
  table,
  symbol,
  group,
  features,
  lookback: z.coerce
    .number()
    .int()
    .min(30)
    .max(50_000)
    .default(2000)
    .describe("Number of newest bars the statistics cover"),
  as_of: asOf,
};

export type BarWindow = { symbol: string; from?: string; as_of?: string };
type Selection = BarWindow & { table: string; group?: string; features?: string[] };

export const qualified = (name: string) => `${CATALOG}.${NAMESPACE}.${identifier(name)}`;

const finiteValue = (column: string) => {
  const value = `source.${identifier(column)}::DOUBLE`;
  return `CASE WHEN isfinite(${value}) THEN ${value} END`;
};

const finite = (column: string) => `${finiteValue(column)} AS ${identifier(column)}`;

const rounded = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? null : Number(value.toPrecision(SIGNIFICANT_DIGITS));

export async function featureTableNames(): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_catalog = $catalog AND table_schema = $namespace AND ends_with(table_name, $suffix)
     ORDER BY table_name`,
    { catalog: CATALOG, namespace: NAMESPACE, suffix: FEATURE_TABLE_SUFFIX },
  );
  return rows.map((row) => row.table_name);
}

export async function featuresOf(name: string): Promise<Feature[]> {
  if (!(await featureTableNames()).includes(name)) throw new InputError(`Unknown feature table: ${name}`);
  const columns = await query<{ column_name: string; column_type: string }>(`DESCRIBE ${qualified(name)}`);
  return columns
    .filter((column) => column.column_name.includes(GROUP_SEPARATOR) && NUMERIC_TYPE.test(column.column_type))
    .map((column) => ({
      name: column.column_name,
      term: featureTerm(column.column_name),
      group: column.column_name.slice(0, column.column_name.indexOf(GROUP_SEPARATOR)),
      type: column.column_type,
      description: describeFeature(column.column_name),
    }));
}

export async function coverageIn(relation: string): Promise<SymbolCoverage[]> {
  return query<SymbolCoverage>(
    `SELECT symbol, count(*)::INTEGER AS rows,
            strftime(min(ts), ${ISO_SECONDS}) AS first, strftime(max(ts), ${ISO_SECONDS}) AS last
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

async function selected(selection: Selection): Promise<Feature[]> {
  const all = await featuresOf(selection.table);
  if (selection.features) {
    const unknown = selection.features.filter((name) => !all.some((feature) => feature.name === name));
    if (unknown.length) throw new InputError(`Unknown features in ${selection.table}: ${unknown.join(", ")}`);
    return all.filter((feature) => selection.features!.includes(feature.name));
  }
  if (!selection.group) return all;
  const inGroup = all.filter((feature) => feature.group === selection.group);
  if (!inGroup.length) throw new InputError(`Unknown feature group in ${selection.table}: ${selection.group}`);
  return inGroup;
}

export const barWindow = ({ symbol, from, as_of }: BarWindow) => ({
  where:
    "source.symbol = $symbol" +
    (from ? " AND source.ts >= $from::TIMESTAMPTZ" : "") +
    (as_of ? " AND source.ts <= $as_of::TIMESTAMPTZ" : ""),
  values: { symbol, ...(from ? { from } : {}), ...(as_of ? { as_of } : {}) },
});

export async function latestFeatures(selection: Selection & { limit: number }): Promise<LatestFeatures> {
  const columns = await selected(selection);
  const { where, values } = barWindow(selection);
  const rows = await query<FeatureRow>(
    `SELECT strftime(source.ts, ${ISO_SECONDS}) AS ts, ${columns.map((feature) => finite(feature.name)).join(", ")}
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
    `SELECT epoch(source.ts::TIMESTAMPTZ)::DOUBLE AS time, strftime(source.ts, ${ISO_SECONDS}) AS ts,
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
};

export async function featureStats(selection: Selection & { lookback: number }): Promise<StatsReport> {
  const columns = await selected(selection);
  const { where, values } = barWindow(selection);
  const perFeature = columns.map((feature, position) => {
    const value = identifier(feature.name);
    return `SELECT ${position} AS position,
              strftime(max(ts), ${ISO_SECONDS}) AS as_of, count(*)::INTEGER AS bars,
              max(CASE WHEN recency = 1 THEN ${value} END) AS current,
              count(${value})::INTEGER AS observations,
              avg(${value}) AS mean, stddev_samp(${value}) AS std, min(${value}) AS min, max(${value}) AS max,
              quantile_cont(${value}, [${QUANTILES.join(", ")}]) AS quantiles,
              avg((${value} <= (SELECT ${value} FROM recent WHERE recency = 1))::INTEGER) AS percentile,
              list(${value} ORDER BY recency) FILTER (WHERE recency <= ${RECENT_VALUES}) AS recent
            FROM recent`;
  });
  const rows = await query<StatsRow>(
    `WITH recent AS (
       SELECT source.ts AS ts, row_number() OVER (ORDER BY source.ts DESC) AS recency,
              ${columns.map((feature) => finite(feature.name)).join(", ")}
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
      const zscore = row.current != null && row.mean != null && row.std ? (row.current - row.mean) / row.std : null;
      return {
        feature: feature.name,
        term: feature.term,
        description: feature.description,
        current: rounded(row.current),
        percentile: rounded(row.percentile),
        zscore: rounded(zscore),
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
        recent: (row.recent ?? []).map(rounded),
      };
    }),
  };
}
