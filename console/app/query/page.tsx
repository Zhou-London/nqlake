"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Cell,
  Chip,
  Code,
  Column,
  EmptyState,
  PageContent,
  PageHeader,
  Row,
  SchemaTree,
  SearchField,
  Select,
  SelectItem,
  StatusDot,
  Table,
  TableBody,
  TableContainer,
  TableHeader,
  ToggleButton,
  toast,
  type SchemaNode,
} from "@nowquant/nqui";
import { SqlEditor, type SQLNamespace } from "@nowquant/nqui/sql";
import { Cable, Check, History, Square, TerminalSquare } from "lucide-react";
import {
  ArrowTransfersPanel,
  DEFAULT_STREAM_SETTINGS,
  StreamSettingsButton,
  isActive,
  isValidPort,
  startTransfer,
  useArrowTransfers,
  type StreamSettings,
} from "@/components/arrow-stream";
import { RowsGrid } from "@/components/rows-grid";
import { useLake } from "@/components/lake-provider";
import { api, tableSql, type Rows } from "@/lib/api";

type HistoryItem = {
  sql: string;
  time: string;
  elapsed: number;
  /** `null` for an Arrow transfer, whose rows go to the receiver. */
  rows: number | null;
};
const DEFAULT_SQL = "-- Start exploring your data here\nSELECT 1 AS ready;";

export default function Query() {
  const { namespaces, tables, status } = useLake();
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [limit, setLimit] = useState("100");
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("Query failed");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [stream, setStream] = useState<StreamSettings>(DEFAULT_STREAM_SETTINGS);
  const arrow = useArrowTransfers();
  const [expanded, setExpanded] = useState<Set<string | number> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const duckdb = status?.services.find((s) => s.name === "duckdb")?.ok;

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("sql");
    if (initial) setSql(initial);
    return () => controller.current?.abort();
  }, []);

  const nodes = useMemo<SchemaNode[]>(
    () =>
      namespaces.map((ns) => ({
        id: `ns:${ns}`,
        name: ns,
        kind: "schema",
        children: tables
          .filter((t) => t.namespace === ns)
          .map((t) => ({
            id: `table:${ns}.${t.name}`,
            name: t.name,
            kind: "table",
            children: t.columns.map((c) => ({
              id: `column:${ns}.${t.name}.${c.name}`,
              name: c.name,
              kind: "column",
              dataType: c.type,
            })),
          })),
      })),
    [namespaces, tables],
  );
  const schema = useMemo<SQLNamespace>(
    () => ({
      lake: Object.fromEntries(
        namespaces.map((ns) => [
          ns,
          Object.fromEntries(
            tables
              .filter((t) => t.namespace === ns)
              .map((t) => [t.name, t.columns.map((c) => c.name)]),
          ),
        ]),
      ),
    }),
    [namespaces, tables],
  );

  async function run(query: string) {
    if (running) return;
    const text = query.trim();
    if (!text) {
      setError("Enter a SQL query.");
      return;
    }
    if (streaming && !isValidPort(stream.port)) {
      setErrorTitle("Transfer failed");
      setError(
        "The port must be a number from 0 to 65535. Fix it in the streaming settings.",
      );
      return;
    }
    setRunning(true);
    setError("");
    setErrorTitle(streaming ? "Transfer failed" : "Query failed");
    setElapsed(null);
    const start = performance.now();
    const abort = new AbortController();
    controller.current = abort;
    try {
      let rows: number | null;
      if (streaming) {
        const transfer = await startTransfer(text, stream, abort.signal);
        toast.success(
          `Transfer #${transfer.id} is waiting on ${transfer.host}:${transfer.port}.`,
        );
        void arrow.refresh();
        rows = null;
      } else {
        const data = await api<Rows>("/query", {
          method: "POST",
          body: JSON.stringify({ sql: text, limit: Number(limit) }),
          signal: abort.signal,
        });
        setResult(data);
        setElapsed(Math.round(performance.now() - start));
        rows = data.row_count;
      }
      setHistory((items) =>
        [
          {
            sql: text,
            time: new Date().toLocaleTimeString("en-US"),
            elapsed: Math.round(performance.now() - start),
            rows,
          },
          ...items,
        ].slice(0, 20),
      );
    } catch (err) {
      setError(
        abort.signal.aborted
          ? streaming
            ? "Stopped waiting for the transfer. The server may still bind the port."
            : "Stopped waiting for results. The server may still be running the query."
          : (err as Error).message,
      );
    } finally {
      setRunning(false);
      controller.current = null;
    }
  }
  function pick(keys: "all" | Iterable<string | number>) {
    if (keys === "all") return;
    const key = String(Array.from(keys)[0] ?? "");
    if (!key.startsWith("table:")) return;
    const [ns, name] = key.slice(6).split(/\.(.*)/s);
    setSql(tableSql(ns, name));
  }

  return (
    <>
      <PageHeader
        title="SQL workspace"
        description="Explore your lakehouse with SQL and turn data into answers."
        actions={
          <>
            <StatusDot
              status={duckdb ? "healthy" : status ? "down" : "unknown"}
              label="DuckDB · Read-only"
            />
            <Button
              variant="outline"
              startContent={<History />}
              endContent={
                <Chip size="sm" color="neutral">
                  {history.length}
                </Chip>
              }
              onPress={() => setHistoryOpen(!historyOpen)}
            >
              Query history
            </Button>
          </>
        }
      />
      <PageContent>
        <div className="grid items-start gap-6 xl:grid-cols-[280px_1fr]">
          <Card className="xl:sticky xl:top-0">
            <CardBody className="flex flex-col gap-2">
              <SearchField
                aria-label="Search available tables"
                size="sm"
                placeholder="Find a table…"
                value={term}
                onChange={setTerm}
              />
              {namespaces.length ? (
                <SchemaTree
                  aria-label="Available tables"
                  className="max-h-[28rem] overflow-auto"
                  nodes={nodes}
                  filter={term}
                  expandedKeys={expanded ?? new Set(nodes.map((n) => n.id))}
                  onExpandedChange={setExpanded}
                  selectionMode="single"
                  selectedKeys={new Set()}
                  onSelectionChange={pick}
                  onAction={(key) => pick([String(key)])}
                />
              ) : (
                <EmptyState
                  size="sm"
                  title="No tables yet"
                  description="Connect to the data service to choose a table here."
                />
              )}
            </CardBody>
          </Card>
          <div className="flex min-w-0 flex-col gap-6">
            <SqlEditor
              value={sql}
              onChange={setSql}
              dialect="postgresql"
              schema={schema}
              defaultSchema="lake"
              minHeight={260}
              maxHeight={520}
              toolbar
              isRunning={running}
              onRun={(query) => void run(query)}
              toolbarContent={
                <div className="flex items-center gap-2">
                  {running && (
                    <Button
                      size="sm"
                      variant="ghost"
                      startContent={<Square />}
                      onPress={() => controller.current?.abort()}
                    >
                      Stop waiting
                    </Button>
                  )}
                  <ToggleButton
                    size="sm"
                    variant="soft"
                    color="primary"
                    isDisabled={running}
                    isSelected={streaming}
                    onChange={setStreaming}
                  >
                    <Cable />
                    Streaming
                  </ToggleButton>
                  {streaming ? (
                    <>
                      <Chip size="sm" color="primary">
                        No row limit
                      </Chip>
                      <StreamSettingsButton
                        settings={stream}
                        onChange={setStream}
                        isDisabled={running}
                      />
                    </>
                  ) : (
                    <Select
                      aria-label="Row limit"
                      size="sm"
                      className="w-32"
                      isDisabled={running}
                      selectedKey={limit}
                      onSelectionChange={(key) => setLimit(String(key))}
                    >
                      {[100, 500, 1000, 10000].map((n) => (
                        <SelectItem key={n} id={String(n)}>
                          {`${n} rows`}
                        </SelectItem>
                      ))}
                    </Select>
                  )}
                </div>
              }
            />
            {error && (
              <Alert color="error" title={errorTitle} description={error} />
            )}
            {(streaming || arrow.transfers?.some((t) => isActive(t))) && (
              <ArrowTransfersPanel
                transfers={arrow.transfers}
                error={arrow.error}
                onRefresh={arrow.refresh}
              />
            )}
            <Card>
              <CardHeader className="items-center">
                <CardTitle>Results</CardTitle>
                {elapsed != null && (
                  <Chip color="success" startContent={<Check />}>
                    Completed in {elapsed} ms
                  </Chip>
                )}
              </CardHeader>
              {(running && !streaming) || result ? (
                <RowsGrid data={result} isLoading={running && !streaming} />
              ) : streaming ? (
                <EmptyState
                  icon={<Cable />}
                  title="Streaming mode sends rows to a receiver"
                  description="Run sends every row of the statement, however many, to a TCP port as an Arrow IPC stream. Nothing is loaded into the browser."
                />
              ) : (
                <EmptyState
                  icon={<TerminalSquare />}
                  title="Your results appear here"
                  description="Write SQL or select a table, then run your query."
                />
              )}
            </Card>
            {historyOpen && (
              <Card>
                <CardHeader className="items-center">
                  <CardTitle>Session query history</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={!history.length}
                    onPress={() => setHistory([])}
                  >
                    Clear history
                  </Button>
                </CardHeader>
                {history.length ? (
                  <TableContainer bare>
                    <Table
                      aria-label="Query history"
                      density="compact"
                      onRowAction={(key) => setSql(history[Number(key)].sql)}
                    >
                      <TableHeader>
                        <Column isRowHeader>Query</Column>
                        <Column>Time</Column>
                        <Column align="end">Rows</Column>
                        <Column align="end">Elapsed</Column>
                      </TableHeader>
                      <TableBody>
                        {history.map((item, i) => (
                          <Row key={i} id={i}>
                            <Cell className="max-w-md">
                              <Code>{item.sql}</Code>
                            </Cell>
                            <Cell className="text-muted">{item.time}</Cell>
                            <Cell align="end" numeric>
                              {item.rows ?? "streamed"}
                            </Cell>
                            <Cell align="end" numeric>
                              {item.elapsed} ms
                            </Cell>
                          </Row>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <EmptyState
                    size="sm"
                    title="No queries yet"
                    description="Successful queries appear here. History clears when you leave this page."
                  />
                )}
              </Card>
            )}
          </div>
        </div>
      </PageContent>
    </>
  );
}
