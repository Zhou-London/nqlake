const descriptions: Record<string, string> = {
  "ta_ohlcv.ret": "Return of the close against the previous bar's close",
  "ta_ohlcv.gap": "Open against the previous bar's close",
  "ta_ohlcv.rv": "Realized volatility of recent returns",
  "ta_ohlcv.gk": "Garman-Klass volatility estimate from open, high, low and close",
  "ta_ohlcv.natr": "Average true range as a fraction of the price",
  "ta_ohlcv.ema_dev": "Distance of the close from its exponential moving average",
  "ta_ohlcv.adx": "Average directional index: trend strength from 0 to 100, without direction",
  "ta_ohlcv.donchian_pos": "Position of the close inside the Donchian channel: 0 at the channel low, 1 at the channel high",
  "ta_ohlcv.rsi": "Relative strength index from 0 to 100",
  "ta_ohlcv.clv": "Close location value: 0 when the bar closes at its low, 1 at its high",
  "ta_ohlcv.range_atr": "Bar range against the average true range",
  "ta_ohlcv.rvol": "Volume against its recent average",
};

export const describeFeature = (column: string): string | null => descriptions[column] ?? null;
