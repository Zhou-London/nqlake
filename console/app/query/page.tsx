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
  type SchemaNode,
} from "@nowquant/nqui";
import { SqlEditor, type SQLNamespace } from "@nowquant/nqui/sql";
import { Check, History, Square, TerminalSquare } from "lucide-react";
import { RowsGrid } from "@/components/rows-grid";
import { useLake } from "@/components/lake-provider";
import { api, tableSql, type Rows } from "@/lib/api";

type HistoryItem = { sql: string; time: string; elapsed: number; rows: number };
const DEFAULT_SQL = "-- Start exploring your data here\nSELECT 1 AS ready;";

export default function Query() {
  const { namespaces, tables, status } = useLake();
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [limit, setLimit] = useState("100");
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [running, setRunning] = useState(false);
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
    setRunning(true);
    setError("");
    setElapsed(null);
    const start = performance.now();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await api<Rows>("/query", {
        method: "POST",
        body: JSON.stringify({ sql: text, limit: Number(limit) }),
        signal: abort.signal,
      });
      const duration = Math.round(performance.now() - start);
      setResult(data);
      setElapsed(duration);
      setHistory((items) =>
        [
          {
            sql: text,
            time: new Date().toLocaleTimeString("en-US"),
            elapsed: duration,
            rows: data.row_count,
          },
          ...items,
        ].slice(0, 20),
      );
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "Stopped waiting for results. The server may still be running the query."
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
                </div>
              }
            />
            {error && (
              <Alert color="error" title="Query failed" description={error} />
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
              {running || result ? (
                <RowsGrid data={result} isLoading={running} />
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
                              {item.rows}
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
