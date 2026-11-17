<p align="center"><img src="https://capsule-render.vercel.app/api?type=waving&height=240&color=gradient&text=NQ%20Lake&fontSize=64&fontAlign=50&fontAlignY=38&desc=v1.0.0-SNAPSHOT&descSize=22&descAlign=50&descAlignY=60" /></p>

<p align="center">
  <img alt="Version 1.0.0-SNAPSHOT" src="https://img.shields.io/badge/version-1.0.0--SNAPSHOT-orange" />
  <img alt="Scala 2.13" src="https://img.shields.io/badge/Scala-2.13-DC322F?logo=scala&logoColor=white" />
  <img alt="Spark 4.1" src="https://img.shields.io/badge/Spark-4.1-E25A1C?logo=apachespark&logoColor=white" />
  <img alt="Apache Iceberg 1.12" src="https://img.shields.io/badge/Iceberg-1.12-1F6FEB?logo=apacheiceberg&logoColor=white" />
  <img alt="SeaweedFS S3" src="https://img.shields.io/badge/SeaweedFS-S3%20%2B%20catalog-3C9A5F" />
  <img alt="DuckDB" src="https://img.shields.io/badge/DuckDB-reader-FFF000?logo=duckdb&logoColor=black" />
  <img alt="JDK 21" src="https://img.shields.io/badge/JDK-21-437291?logo=openjdk&logoColor=white" />
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

# NQLake

NQLake is the lakehouse storage part of the NowQuant platform. It keeps all
market data in one place, so backtests and research can read it.

## Features

- **All data levels**: every kind of data, from OHLCV bars to MBO orders, goes into the lake.
- **Daily load**: new data first waits in a landing area. After the market closes, it is loaded into the lake once a day.
- **Type check on upload**: `upload` lists every column whose type Iceberg cannot store, and asks before it converts the column.
- **The lake looks after itself**: the lakehouse sorts and removes duplicates. Writers do not need to.
- **In-process reads**: C++ backtest programs read Iceberg tables directly through DuckDB. There is no service in between.

## Tech stack

The data path is all Scala/Java. Python is only used for scripts that run as separate programs.

| Layer | Choice | Notes |
| --- | --- | --- |
| Table format | Apache Iceberg (format v2) | Not tied to Databricks. Flink, DuckDB and Trino support it fully. |
| File format | Parquet + zstd |  |
| Write engine | Spark 4.x (Scala 2.13) | Loads, sorts and removes duplicates. Replaces PyIceberg from the old version. |
| Catalog | Iceberg REST Catalog built into SeaweedFS | One table bucket is one catalog. It gives readers and writers short-lived keys for each table. |
| Object storage | SeaweedFS (S3 API) | Table bucket `warehouse` uses Iceberg S3FileIO. Plain bucket `landing` uses Hadoop S3A. |
| Read engine | DuckDB (inside the C++ program) | Reads tables directly during backtests. |

## Data flow

1. **Land**: a C++ program writes processed data as Parquet files into the `landing` bucket.
2. **Load**: after the market closes, a Scala program runs Spark. It reads the landing files, sorts them, removes duplicates and writes them into Iceberg tables in `warehouse`. Then it deletes the landing files.
3. **Read**: during a backtest, a C++ program queries the Iceberg tables with its own DuckDB.

## How it runs

| Part | Runs as | Why |
| --- | --- | --- |
| SeaweedFS (object storage + catalog) | Docker container | A long-running service that keeps state |
| `nqlake` (Scala + Spark `local[*]`) | Program on the host | A batch job that runs once a day, with Spark inside it |
| DuckDB | Inside the reading program | An embedded library |

## Usage

You need Docker, JDK 21 and sbt.

```bash
docker compose up -d --wait
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
sbt stage
alias nqlake=target/universal/stage/bin/nqlake

nqlake init
nqlake seed --date 2026-11-13
nqlake upload
nqlake maintain
```

| Command | What it does |
| --- | --- |
| `init` | Creates namespace `market` and tables `ohlcv` and `mbo` |
| `seed --date D` | Makes sample Parquet files for day D and adds them to `s3://landing/<table>/` |
| `upload` | Loads every file in the landing bucket into the table named by its folder, then deletes the files |
| `upload F... --table T` | Loads the Parquet files `F` into table `T`. Creates `T` when it does not exist. |
| `maintain` | Compacts data files, and removes old snapshots and orphan files |
| `mmap --sql Q` | Writes a query result as one uncompressed Arrow IPC file, so another program can mmap it |

`upload`, `seed` and `maintain` take `--table`, which you can repeat. By default
they work on all tables. `seed` only knows `ohlcv` and `mbo`. `nqlake -h` and
`nqlake <command> -h` list all options and environment variables. Short
options: `-d` date, `-t` table, `-k` key, `-p` partition, `-o` output file,
`-y` skip the confirm step.

Exit codes: `0` success, `1` the run failed, `2` bad arguments.

Tables are split by `day(ts)` and sorted by primary key. The `ohlcv` key is
`(symbol, ts)`. The `mbo` key is `(symbol, ts, sequence)`.

### upload

```bash
nqlake upload
nqlake upload trades.parquet --table trades --key symbol,ts,order_id
```

- Without files, `upload` reads the landing bucket. The folder `s3://landing/<table>/` feeds the table `<table>`. `upload` deletes the files it loaded after the write succeeds.
- With files, `--table` is required. A file can be a local path, an `s3a://` URL, or a folder of Parquet files. `upload` keeps these files.
- `upload` creates the table when it does not exist. `--key` sets the primary key of the new table.
- A new table is split by `day` of its partition column. The partition column is `ts` when `ts` is a timestamp, or else `date` when `date` is a DATE. A table with neither column has no partitions. `--partition day|month|year|none` sets another split. Use `month` or `none` for hourly or daily bars: `day` gives one small file per day.
- A table with a key gets one row per key: `upload` removes duplicates and MERGEs. Running the same upload again gives the same result. Key columns reject NULL.
- A key with `ts` limits the MERGE to the `ts` range of the upload. A table split by `date` also limits the MERGE to the `date` range. `date` must be the day of `ts` in such a table.
- A table without a key gets every row appended. Duplicates stay.
- All files of one upload must have the same columns and types.

`upload` converts these Parquet types, because Iceberg format v2 has no equal type:

| In the file | In the table | Notes |
| --- | --- | --- |
| `timestamp[ns, UTC]` | `timestamp` (microseconds) | Nanoseconds are truncated |
| `timestamp[ns]` | `timestamp_ntz` (microseconds) | Nanoseconds are truncated |
| INT96 timestamp | `timestamp` (microseconds) | Nanoseconds are truncated |
| `uint8`, `uint16`, `int8`, `int16` | `int` |  |
| `uint32` | `bigint` |  |
| `uint64` | `decimal(20,0)` |  |

For an existing table, `upload` also converts each column to the type of the
table column. A value that does not fit fails the upload, and the table stays
unchanged. Columns that the table lacks are dropped. Columns that the files
lack are written as NULL.

`upload` prints each of these cases as a warning and waits for you to confirm.
`--yes` skips this. Without a terminal, `--yes` is required. An upload without
warnings starts at once.

### mmap

```bash
nqlake mmap --sql "
  SELECT symbol, ts, sequence, action, side, price, size
  FROM market.mbo
  WHERE ts >= TIMESTAMP '2026-11-13' AND ts < TIMESTAMP '2026-11-14'
  ORDER BY symbol, ts, sequence"
```

- Pass the query with `--sql`, or read it from a file with `--sql-file`. Only queries are allowed.
- The file is written to `~/.nqlake/mmap.arrow`. `--output` or `NQLAKE_MMAP_OUTPUT` sets another path. `mmap` creates the folder.
- The file is in Arrow IPC file format. Rows keep the order of the query's `ORDER BY`. Each record batch has `--batch-rows` rows (1 million by default). The last batch can be smaller.
- `ts` has the type `timestamp[us, UTC]`.
- Before writing, it prints the row count, the expected size and the free space on the target disk, then waits for you to confirm. `--yes` skips this. Without a terminal, `--yes` is required.
- Data is first written to `.<file name>.<uuid>.partial` in the same folder. After it is flushed to disk, it is renamed to the target file. If the target file exists, it is replaced in one step. Programs that already mmap the old file keep reading the old content.

## Apps

[`apps/nqlake-mcp`](apps/nqlake-mcp) is a Next.js app. It serves the feature tables to a UI and to agents over MCP, and stores the suggestions an agent writes.

## Read with DuckDB

Read tables with DuckDB:

```sql
CREATE SECRET (TYPE iceberg, URI 'http://localhost:8181', CLIENT_ID 'nqlake', CLIENT_SECRET 'nqlake-dev-secret');
ATTACH 'warehouse' AS lake (TYPE iceberg, URI 'http://localhost:8181');
SELECT count(*) FROM lake.market.ohlcv;
```

Ports: the catalog is at `http://localhost:8181`, and S3 is at
`http://localhost:8333`. `nqlake` and DuckDB use the same access key pair to
log in to the catalog. `nqlake` uses this pair to read and write data files
directly. DuckDB gets short-lived keys for data files from the catalog.
