# NQLake MCP

NQLake MCP shows the OHLCV bars and the feature tables of the lake to people
and to agents. A feature table covers many symbols, about 100 US equities and
ETFs. An agent compares the symbols through MCP tools and writes one suggestion
per symbol it picks. The UI shows each active symbol as a thumbnail: its closes,
its changes, its chosen features with their peer percentiles, and its
suggestion. You can search and sort the thumbnails, and open one for the bars,
the features and the suggestion of that symbol.

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

The app listens on port 40021 of every network interface, so other devices on the LAN can open `http://<host IP>:40021`. The Feature API and the read tools have no login; only `write_suggestions` needs the token.

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
It has a `symbol` column and a `ts` column. `ts` is a 64-bit integer: the bar
close in nanoseconds since the Unix epoch, UTC. The `date` column holds the UTC
day of `ts`. The table is partitioned by the month of `date`. A feature is a
numeric column named `<group>.<feature>`, for example `ta_ohlcv.rsi`.

A feature can have peer columns, `<feature>_rank` and `<feature>_z`, for
example `ta_ohlcv.rsi_rank` and `ta_ohlcv.rsi_z`. They place the value among
the symbols with a bar closing at the same time. The peer rank runs from 0 for
the lowest value to 1 for the highest, and tied values share the mean of their
ranks. The peer z-score is the distance from their mean in standard deviations.
The app reads them as stored and lists them under the feature's `peers`, not as
features of their own.

`lib/glossary.ts` holds the term and the description of each feature. The term
is the name of the feature in plain words, for example `Relative strength
index` for `ta_ohlcv.rsi`. A peer column takes the term of its feature
followed by `peer rank` or `peer z-score`. The UI shows the terms. The tools
return the terms and the descriptions to the agent.

## Feature API

| Request | Returns |
| --- | --- |
| `GET /api/symbols` | Every symbol of the OHLCV table, with the feature tables that cover it |
| `GET /api/closes` | The newest closes of every symbol, oldest first |
| `GET /api/ohlcv?symbol=S` | The bars of one symbol as `[unix seconds of the bar close, open, high, low, close, volume]`, oldest first |
| `GET /api/features` | Every feature table: groups, features, symbols |
| `GET /api/features/<table>` | One feature table |
| `GET /api/features/<table>/compare` | Every symbol on its newest bar, placed among the other symbols and inside its own history |
| `GET /api/features/<table>/stats?symbol=S` | Statistics of each feature over the newest bars, with the peer rank and peer z-score of the newest bar |
| `GET /api/features/<table>/latest?symbol=S` | The newest bars, newest first, with the peer columns of each feature |
| `GET /api/features/<table>/series?symbol=S` | Each feature as a list of `[unix seconds, value]`, oldest first |
| `GET /api/suggestions` | The current suggestion of each symbol |

`compare`, `stats`, `latest` and `series` take `group`, `features`
(comma-separated), and `as_of` (a UTC time; bars after it are left out).
Without `features`, they read every feature of the group or of the table.
`features` can also name peer columns.
`ohlcv` takes `as_of` too.

| Request | Other parameters |
| --- | --- |
| `stats` | `lookback`: 30 to 50,000 bars, default 2,000 |
| `compare` | `lookback` as in `stats`. `symbols` (comma-separated). `sort_by`: a compared feature column, or one of its peer columns. `order`: `desc` (default) or `asc`. `limit`: 1 to 200 symbols, default 200. |
| `closes` | `limit`: 2 to 1,000 closes per symbol, default 240 |
| `latest` | `limit`: 1 to 5,000 newest bars, default 500 |
| `series`, `ohlcv` | `limit`: 1 to 200,000 newest bars, default 200,000. `from`: a UTC time; bars before it are left out. |
| `suggestions` | `symbol`: return only the suggestion of this symbol |

`compare` gives each feature of each symbol as `[value, peer rank, peer
z-score, percentile, z-score]`. The peer rank and the peer z-score come from
the peer columns of the symbol's newest bar; they are null for a feature
without peer columns. The percentile and the z-score place the
value inside the symbol's own newest `lookback` bars. Each symbol is read at its
own newest bar, and carries that time as `as_of`. A symbol without a bar in the
7 days before the newest bar of the table is inactive: `compare` lists it in
`inactive` and leaves it out, and the UI hides its thumbnail.

`ohlcv` leaves out a bar when one of its prices is missing. `series` leaves
out a point when the feature has no value at that bar. When a table holds
several rows for one symbol and time, `ohlcv` and `series` return one of them. The MCP tools
`get_latest_features` and `get_ohlcv` return at most 200 bars.

## MCP tools

| Tool | Does |
| --- | --- |
| `list_feature_tables` | Lists the feature tables |
| `describe_feature_table` | Describes one feature table |
| `compare_symbols` | Places every symbol among the others and inside its own history, in one call |
| `get_feature_stats` | Places the current value of each feature inside its history |
| `get_latest_features` | Returns the newest bars of a feature table |
| `get_ohlcv` | Returns the newest OHLCV bars of one symbol |
| `read_suggestions` | Returns the current suggestions, or the suggestion of one symbol |
| `write_suggestions` | Stores one suggestion per symbol, up to 200 symbols per call |

`write_suggestions` needs the header `Authorization: Bearer <token>`, where
the token equals `NQLAKE_MCP_WRITE_TOKEN`. Each suggestion names the feature
tables it relies on and the `as_of` time each read returned for its symbol. The server
rejects an `as_of` later than the newest bar of the table. A suggestion can
list the features it cites in `features`. Each one must be a feature or a
peer column of a table in its sources. The UI charts the feature of a cited
peer column. The UI marks a suggestion when its table has newer bars.

Connect Claude Code:

```bash
claude mcp add --transport http nqlake http://127.0.0.1:40021/api/mcp \
  --header "Authorization: Bearer $NQLAKE_MCP_WRITE_TOKEN"
```
