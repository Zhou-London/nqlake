import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compareShape,
  compareSymbols,
  describeFeatureTable,
  featureStats,
  InputError,
  latestFeatures,
  latestShape,
  listFeatureTables,
  statsShape,
  tableShape,
} from "./features";
import { INACTIVE_AFTER_DAYS } from "./limits";
import { ohlcvBars, ohlcvShape } from "./ohlcv";
import { readShape, readSuggestions, writeShape, writeSuggestions } from "./suggestions";

const INSTRUCTIONS = `NQLake MCP serves OHLCV bars and feature tables from the NQLake lakehouse and stores trading suggestions.
A feature table covers many symbols, about 100 US equities and ETFs.

Workflow for writing suggestions:
1. list_feature_tables shows every feature table, its feature groups and the symbols it covers.
2. For each table, call compare_symbols. It returns every active symbol at once and places each feature value
   among the other symbols (peer percentile) and inside the symbol's own history (percentile, z-score).
   Use sort_by and limit to read the extremes of one feature. Pick the symbols whose features stand out.
3. For each picked symbol, call get_feature_stats for the detail of its own history. Call get_latest_features
   only when the order of the newest bars matters. Call get_ohlcv for the prices behind them.
4. Call write_suggestions once, with one suggestion per picked symbol. Pass every feature table you relied on in
   sources, with the as_of value the tool returned for that symbol, and the feature columns the reasoning cites in
   features. Symbols end their bars at different times: take as_of from the symbol's own entry, not from the table.

A symbol keeps one suggestion: writing replaces the earlier one and no history is kept.
Every tool except write_suggestions is read-only. Feature columns are named <group>.<feature>.
Each feature has a term, its name in plain words. Name features by their terms in the title and body of a suggestion.
Pass column names only in features.
Every bar, OHLCV or feature, is stamped with its closing time.`;

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

type Access = { canWrite: boolean; writeRefusal: string };

const answer = (result: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(result) }] });

const refusal = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

async function attempt(run: () => Promise<unknown>) {
  try {
    return answer(await run());
  } catch (error) {
    if (error instanceof InputError) return refusal(error.message);
    if (error instanceof z.ZodError) return refusal(z.prettifyError(error));
    console.error(error);
    return refusal("The lake is unavailable");
  }
}

export function featureServer(access: Access): McpServer {
  const server = new McpServer({ name: "nqlake-mcp", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_feature_tables",
    {
      title: "List feature tables",
      description: "Lists every feature table with its feature groups, feature terms and descriptions, and symbol coverage.",
      annotations: READ_ONLY,
    },
    () => attempt(listFeatureTables),
  );

  server.registerTool(
    "describe_feature_table",
    {
      title: "Describe a feature table",
      description: "Returns the feature groups, feature terms and descriptions, and symbol coverage of one feature table.",
      inputSchema: tableShape,
      annotations: READ_ONLY,
    },
    ({ table }) => attempt(() => describeFeatureTable(table)),
  );

  server.registerTool(
    "compare_symbols",
    {
      title: "Compare symbols",
      description:
        "Compares the symbols of one feature table on their newest bars. Each feature of each symbol is " +
        "[value, peer percentile, percentile in the symbol's own history, z-score in the symbol's own history]. " +
        "The peer percentile is the share of compared symbols whose value is at or below this one. " +
        "Each symbol carries as_of, the time of its newest bar read. Symbols without a bar in the " +
        `${INACTIVE_AFTER_DAYS} days before the newest bar of the table are listed in inactive and left out.`,
      inputSchema: compareShape,
      annotations: READ_ONLY,
    },
    (input) => attempt(() => compareSymbols(input)),
  );

  server.registerTool(
    "get_feature_stats",
    {
      title: "Summarize features",
      description:
        "Summarizes each feature of one symbol over its newest bars: term, current value, percentile and z-score of " +
        "the current value, mean, standard deviation, quantiles, and the newest values (newest first). " +
        "Returns as_of, the time of the newest bar read.",
      inputSchema: statsShape,
      annotations: READ_ONLY,
    },
    (input) => attempt(() => featureStats(input)),
  );

  server.registerTool(
    "get_latest_features",
    {
      title: "Read the newest bars",
      description:
        "Returns the newest bars of one symbol, newest first, at most 200. Returns as_of, the time of the newest bar read.",
      inputSchema: latestShape,
      annotations: READ_ONLY,
    },
    (input) => attempt(() => latestFeatures(input)),
  );

  server.registerTool(
    "get_ohlcv",
    {
      title: "Read the newest OHLCV bars",
      description:
        "Returns the newest OHLCV bars of one symbol, oldest first, at most 200, each as " +
        "[unix seconds of the bar close, open, high, low, close, volume]. Returns as_of, the time of the newest bar read.",
      inputSchema: ohlcvShape,
      annotations: READ_ONLY,
    },
    (input) => attempt(() => ohlcvBars(input)),
  );

  server.registerTool(
    "read_suggestions",
    {
      title: "Read current suggestions",
      description:
        "Returns the current suggestion of each symbol, or of one symbol. A source is stale when its table has newer bars.",
      inputSchema: readShape,
      annotations: READ_ONLY,
    },
    (input) => attempt(() => readSuggestions(input)),
  );

  server.registerTool(
    "write_suggestions",
    {
      title: "Write suggestions",
      description:
        "Stores one suggestion per symbol and replaces the symbol's earlier suggestion. " +
        "Each source must name a feature table and the as_of value returned when the table was read. " +
        "features lists the feature columns of those tables that the suggestion cites.",
      inputSchema: writeShape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (input) => (access.canWrite ? attempt(() => writeSuggestions(input)) : Promise.resolve(refusal(access.writeRefusal))),
  );

  return server;
}
