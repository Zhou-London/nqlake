import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { config } from "./config";
import { coverageOf, featuresOf, featureTableNames, InputError, type SymbolCoverage } from "./features";

const source = z.object({
  table: z.string().min(1).describe("Feature table that was read"),
  as_of: z.iso.datetime({ offset: true }).describe("The as_of value returned by the tool that read the table"),
});

const suggestion = z.object({
  symbol: z.string().min(1),
  stance: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1).optional().describe("0 to 1"),
  title: z.string().min(1).max(120).describe("One line that states the suggestion"),
  body: z.string().min(1).max(4000).describe("The reasoning, citing feature values by their terms"),
  sources: z.array(source).min(1).max(32).describe("Every feature table the suggestion relies on"),
  features: z
    .array(z.string().min(1))
    .max(64)
    .optional()
    .describe("Full feature column names of the source tables that the suggestion cites"),
});

export const readShape = {
  symbol: z.string().min(1).optional().describe("Return only this symbol's suggestion; omit for every symbol"),
};

export const writeShape = {
  model: z.string().min(1).max(120).describe("Name of the model that wrote the suggestions"),
  suggestions: z.array(suggestion).min(1).max(100).describe("One suggestion per symbol; replaces that symbol's suggestion"),
};

export type Source = z.infer<typeof source>;
export type Suggestion = Omit<z.infer<typeof suggestion>, "features"> & {
  features: string[];
  model: string;
  created_at: string;
};
export type SourceFreshness = Source & { latest: string | null; stale: boolean };
export type SuggestionView = Omit<Suggestion, "sources"> & { sources: SourceFreshness[] };

type StoredSuggestion = {
  symbol: string;
  stance: Suggestion["stance"];
  confidence: number | null;
  title: string;
  body: string;
  sources: string;
  features: string;
  model: string;
  created_at: string;
};

const store = globalThis as typeof globalThis & { nqlakeSuggestions?: DatabaseSync };

function database(): DatabaseSync {
  if (!store.nqlakeSuggestions) {
    mkdirSync(dirname(config.suggestionsDb), { recursive: true });
    const opened = new DatabaseSync(config.suggestionsDb);
    opened.exec(`
      CREATE TABLE IF NOT EXISTS suggestions (
        symbol TEXT PRIMARY KEY,
        stance TEXT NOT NULL,
        confidence REAL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        sources TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        features TEXT NOT NULL DEFAULT '[]'
      ) STRICT`);
    const columns = opened.prepare("PRAGMA table_info(suggestions)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "features"))
      opened.exec("ALTER TABLE suggestions ADD COLUMN features TEXT NOT NULL DEFAULT '[]'");
    store.nqlakeSuggestions = opened;
  }
  return store.nqlakeSuggestions;
}

const seconds = (instant: string) => Math.floor(Date.parse(instant) / 1000);

function coverageByTable(tables: string[]): Promise<Map<string, SymbolCoverage[]>> {
  return Promise.all([...new Set(tables)].map(async (table) => [table, await coverageOf(table)] as const)).then(
    (entries) => new Map(entries),
  );
}

function storedSuggestions(symbol?: string): Suggestion[] {
  const rows = (
    symbol
      ? database().prepare("SELECT * FROM suggestions WHERE symbol = ?").all(symbol)
      : database().prepare("SELECT * FROM suggestions ORDER BY symbol").all()
  ) as StoredSuggestion[];
  return rows.map((row) => ({
    ...row,
    confidence: row.confidence ?? undefined,
    sources: JSON.parse(row.sources) as Source[],
    features: JSON.parse(row.features) as string[],
  }));
}

export async function readSuggestions(filter: { symbol?: string } = {}): Promise<SuggestionView[]> {
  const stored = storedSuggestions(filter.symbol);
  const known = await featureTableNames();
  const coverage = await coverageByTable(
    stored.flatMap((item) => item.sources.map((read) => read.table)).filter((table) => known.includes(table)),
  );
  return stored.map((item) => ({
    ...item,
    sources: item.sources.map((read) => {
      const latest = coverage.get(read.table)?.find((entry) => entry.symbol === item.symbol)?.last ?? null;
      return { ...read, latest, stale: latest != null && seconds(latest) > seconds(read.as_of) };
    }),
  }));
}

export async function writeSuggestions(input: { model: string; suggestions: z.infer<typeof suggestion>[] }) {
  const repeated = input.suggestions.map((item) => item.symbol).filter((name, index, all) => all.indexOf(name) !== index);
  if (repeated.length) throw new InputError(`More than one suggestion for: ${[...new Set(repeated)].join(", ")}`);

  const known = await featureTableNames();
  const tables = input.suggestions.flatMap((item) => item.sources.map((read) => read.table));
  const unknown = tables.filter((table) => !known.includes(table));
  if (unknown.length) throw new InputError(`Unknown feature tables in sources: ${[...new Set(unknown)].join(", ")}`);

  const coverage = await coverageByTable(tables);
  for (const item of input.suggestions)
    for (const read of item.sources) {
      const covered = coverage.get(read.table)!.find((entry) => entry.symbol === item.symbol);
      if (!covered) throw new InputError(`${read.table} has no bars for ${item.symbol}`);
      if (seconds(read.as_of) > seconds(covered.last))
        throw new InputError(`${read.table} ends at ${covered.last} for ${item.symbol}; as_of ${read.as_of} is later`);
    }

  const featureNames = new Map(
    await Promise.all(
      [...new Set(tables)].map(async (table) => [table, (await featuresOf(table)).map((feature) => feature.name)] as const),
    ),
  );
  for (const item of input.suggestions) {
    const cited = item.sources.flatMap((read) => featureNames.get(read.table)!);
    const uncited = (item.features ?? []).filter((name) => !cited.includes(name));
    if (uncited.length) throw new InputError(`Features outside the sources of ${item.symbol}: ${uncited.join(", ")}`);
  }

  const created_at = new Date().toISOString();
  const db = database();
  const upsert = db.prepare(`
    INSERT INTO suggestions (symbol, stance, confidence, title, body, sources, features, model, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (symbol) DO UPDATE SET
      stance = excluded.stance, confidence = excluded.confidence, title = excluded.title, body = excluded.body,
      sources = excluded.sources, features = excluded.features, model = excluded.model, created_at = excluded.created_at`);
  db.exec("BEGIN");
  try {
    for (const item of input.suggestions)
      upsert.run(
        item.symbol,
        item.stance,
        item.confidence ?? null,
        item.title,
        item.body,
        JSON.stringify(item.sources),
        JSON.stringify([...new Set(item.features ?? [])]),
        input.model,
        created_at,
      );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { written: input.suggestions.map((item) => item.symbol), created_at };
}
