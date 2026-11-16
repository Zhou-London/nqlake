type Entry = { term: string; description: string };

const GROUP_SEPARATOR = ".";

const entries: Record<string, Entry> = {
  "ta_ohlcv.ret": { term: "Return", description: "Return of the close against the previous bar's close" },
  "ta_ohlcv.gap": { term: "Opening gap", description: "Open against the previous bar's close" },
  "ta_ohlcv.rv": { term: "Realized variance", description: "Squared return of the bar" },
  "ta_ohlcv.gk": {
    term: "Garman-Klass variance",
    description: "Variance of the bar, estimated from its open, high, low and close",
  },
  "ta_ohlcv.natr": {
    term: "Normalized average true range",
    description: "Average true range as a fraction of the price",
  },
  "ta_ohlcv.ema_dev": {
    term: "Moving average deviation",
    description: "Close minus its exponential moving average, in average true ranges",
  },
  "ta_ohlcv.adx": {
    term: "Average directional index",
    description: "Trend strength from 0 to 100, without direction",
  },
  "ta_ohlcv.donchian_pos": {
    term: "Donchian channel position",
    description: "Position of the close inside the Donchian channel: 0 at the channel low, 1 at the channel high",
  },
  "ta_ohlcv.rsi": {
    term: "Relative strength index",
    description: "Share of upward moves in recent price moves, from 0 to 100",
  },
  "ta_ohlcv.clv": {
    term: "Close location value",
    description: "Position of the close inside the bar: 0 at its low, 1 at its high",
  },
  "ta_ohlcv.range_atr": { term: "Relative range", description: "Bar range against the average true range" },
  "ta_ohlcv.rvol": {
    term: "Relative volume",
    description: "Volume against the average volume of the same hour on earlier days",
  },
};

export const describeFeature = (column: string): string | null => entries[column]?.description ?? null;

export const featureTerm = (column: string): string =>
  entries[column]?.term ?? column.slice(column.indexOf(GROUP_SEPARATOR) + 1);
