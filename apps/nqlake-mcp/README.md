# NQLake MCP

NQLake MCP shows the OHLCV bars and the feature tables of the lake to people
and to agents. An agent reads them through MCP tools and writes one suggestion
per symbol. The UI lists the symbols, each with a thumbnail of its closes, and
shows the bars, the features and the suggestion of the symbol you open.

## Parts

| Part | Path | Access |
| --- | --- | --- |
| UI | `/`, `/?symbol=S` | Read |
| Feature API | `/api/symbols`, `/api/ohlcv`, `/api/features`, `/api/suggestions` | Read |
| MCP endpoint | `/api/mcp` | Read, plus the one write tool `write_suggestions` |

The Feature API and the MCP tools call the same query functions in `lib/`.
DuckDB runs inside the Node process and reads the Iceberg tables directly.
Suggestions live in a SQLite file. Each symbol keeps only its newest
suggestion. No history is kept.

## Run

You need Node 24 and a running lake (`docker compose up -d --wait` in the
repository root).

```bash
cd apps/nqlake-mcp
npm install
cp .env.example .env
npm run dev
```

The app listens on `http://127.0.0.1:40021`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NQLAKE_CATALOG_URI` | `http://localhost:8181` | Iceberg REST catalog |
| `NQLAKE_WAREHOUSE` | `warehouse` | Table bucket |
| `NQLAKE_S3_ACCESS_KEY`, `NQLAKE_S3_SECRET_KEY` | Local development keys | Catalog login |
| `NQLAKE_MCP_DB` | `~/.nqlake/suggestions.db` | SQLite file of the suggestions |
| `NQLAKE_MCP_WRITE_TOKEN` | Empty | Token that `write_suggestions` requires. Writing is off while it is empty. |

## Tables

OHLCV bars come from table `us_equity_ohlcv` in namespace `market`. It holds
Databento OHLCV records: `ts_event` is the bar open in nanoseconds, `rtype`
gives the bar length, and the prices are integers in units of 1e-9. The app
converts the prices to decimals and stamps each bar with its closing time.
Feature tables stamp their rows the same way, so a bar and the features
computed from it share one time.

A feature table is a table in namespace `market` whose name ends in `_feat`.
It has a `symbol` column and a `ts` timestamp column. A feature is a numeric
column named `<group>.<feature>`, for example `ta_ohlcv.rsi`.

`lib/glossary.ts` holds the term and the description of each feature. The term
is the name of the feature in plain words, for example `Relative strength
index` for `ta_ohlcv.rsi`. The UI shows the terms. The tools return the terms
and the descriptions to the agent.

## Feature API

| Request | Returns |
| --- | --- |
| `GET /api/symbols` | Every symbol of the OHLCV table, with the feature tables that cover it |
| `GET /api/ohlcv?symbol=S` | The bars of one symbol as `[unix seconds of the bar close, open, high, low, close, volume]`, oldest first |
| `GET /api/features` | Every feature table: groups, features, symbols |
| `GET /api/features/<table>` | One feature table |
| `GET /api/features/<table>/stats?symbol=S` | Statistics of each feature over the newest bars |
| `GET /api/features/<table>/latest?symbol=S` | The newest bars, newest first |
| `GET /api/features/<table>/series?symbol=S` | Each feature as a list of `[unix seconds, value]`, oldest first |
| `GET /api/suggestions` | The current suggestion of each symbol |

`stats`, `latest` and `series` take `group`, `features` (comma-separated), and
`as_of` (a UTC time; bars after it are left out). `ohlcv` takes `as_of` too.

| Request | Other parameters |
| --- | --- |
| `stats` | `lookback`: 30 to 50,000 bars, default 2,000 |
| `latest` | `limit`: 1 to 5,000 newest bars, default 500 |
| `series`, `ohlcv` | `limit`: 1 to 200,000 newest bars, default 200,000. `from`: a UTC time; bars before it are left out. |
| `suggestions` | `symbol`: return only the suggestion of this symbol |

`ohlcv` leaves out a bar when one of its prices is missing. `series` leaves
out a point when the feature has no value at that bar. When a table holds
several rows for one symbol and time, `ohlcv` and `series` return one of them. The MCP tools
`get_latest_features` and `get_ohlcv` return at most 200 bars.

## MCP tools

| Tool | Does |
| --- | --- |
| `list_feature_tables` | Lists the feature tables |
| `describe_feature_table` | Describes one feature table |
| `get_feature_stats` | Places the current value of each feature inside its history |
| `get_latest_features` | Returns the newest bars of a feature table |
| `get_ohlcv` | Returns the newest OHLCV bars of one symbol |
| `read_suggestions` | Returns the current suggestions, or the suggestion of one symbol |
| `write_suggestions` | Stores one suggestion per symbol |

`write_suggestions` needs the header `Authorization: Bearer <token>`, where
the token equals `NQLAKE_MCP_WRITE_TOKEN`. Each suggestion names the feature
tables it relies on and the `as_of` time each read returned. The server
rejects an `as_of` later than the newest bar of the table. A suggestion can
list the features it cites in `features`. Each one must be a feature of a
table in its sources. The UI marks a suggestion when its table has newer bars.

Connect Claude Code:

```bash
claude mcp add --transport http nqlake http://127.0.0.1:40021/api/mcp \
  --header "Authorization: Bearer $NQLAKE_MCP_WRITE_TOKEN"
```
