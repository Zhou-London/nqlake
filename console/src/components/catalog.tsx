import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Database,
  Folder,
  HardDrive,
  Layers3,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Server,
  Table2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { Page } from "@/App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PageHeading, Empty, Loading, TextLink, ErrorPanel } from "./shared";
import type { Modal } from "./forms";
import type { LakeTable, Status } from "@/lib/api";
import { cn, date, number } from "@/lib/utils";
interface CatalogProps {
  tables: LakeTable[];
  namespaces: string[];
  status: Status | null;
  statusError: string;
  loading: boolean;
  loaded: boolean;
  error: string;
  namespace: string;
  setNamespace: (s: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  navigate: (p: Page) => void;
  modal: (m: Modal) => void;
  openTable: (t: LakeTable) => void;
}
export function CatalogPage({
  tables,
  namespaces,
  status,
  statusError,
  loading,
  loaded,
  error,
  namespace,
  setNamespace,
  searchRef,
  navigate,
  modal,
  openTable,
}: CatalogProps) {
  const [search, setSearch] = useState(""),
    [view, setView] = useState<"list" | "grid">("list"),
    [sort, setSort] = useState("name"),
    [pageIndex, setPageIndex] = useState(0);
  useEffect(() => setPageIndex(0), [search, namespace, sort]);
  const filtered = useMemo(
    () =>
      tables
        .filter(
          (t) =>
            (namespace === "all" || t.namespace === namespace) &&
            `${t.namespace}.${t.name}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "rows"
            ? (b.row_count || 0) - (a.row_count || 0)
            : sort === "updated"
              ? (b.snapshot_at || "").localeCompare(a.snapshot_at || "")
              : a.name.localeCompare(b.name),
        ),
    [tables, namespace, search, sort],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8)),
    currentPage = Math.min(pageIndex, pages - 1),
    visible = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const recent = [...tables]
    .filter((t) => t.snapshot_at)
    .sort((a, b) => b.snapshot_at!.localeCompare(a.snapshot_at!))
    .slice(0, 3);
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Your lakehouse, in focus"
        title="Data catalog"
        description="Explore, organize, and make more of your data."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("imports")}>
              <UploadCloud />
              Import data
            </Button>
            <Button
              onClick={() =>
                modal(
                  namespaces.length
                    ? {
                        kind: "table",
                        namespace: namespace === "all" ? undefined : namespace,
                      }
                    : { kind: "namespace" },
                )
              }
            >
              <Plus />
              {namespaces.length ? "Create table" : "Create namespace"}
            </Button>
          </>
        }
      />
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total tables",
            value: loaded ? number(tables.length) : "—",
            sub: "Across your lakehouse",
            icon: Table2,
            detail: "Iceberg",
          },
          {
            label: "Namespaces",
            value: loaded ? number(namespaces.length) : "—",
            sub: "Organized, by design",
            icon: Folder,
            detail: "Catalog",
          },
          {
            label: "Total records",
            value: loaded
              ? number(tables.reduce((sum, t) => sum + (t.row_count || 0), 0))
              : "—",
            sub: "In current table snapshots",
            icon: Layers3,
            detail: "Rows",
          },
          {
            label: "Service health",
            value: status
              ? `${status.services.filter((s) => s.ok).length} / ${status.services.length}`
              : "—",
            sub: status?.ok
              ? "All services are operational"
              : statusError
                ? "Backend is unavailable"
                : "Waiting for service status",
            icon: Activity,
            detail: status?.ok ? "Healthy" : "Live",
            health: true,
          },
        ].map(({ label, value, sub, icon: Icon, detail, health }) => (
          <div className="panel px-5 py-4" key={label}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                {label}
              </span>
              <Icon size={16} strokeWidth={1.7} className="text-slate-400" />
            </div>
            <div className="my-4 flex items-end justify-between gap-2">
              <p className="text-[28px] font-semibold leading-none tracking-[-.04em]">
                {value}
              </p>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-[9px] font-medium",
                  health && status?.ok
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-50 text-slate-400",
                )}
              >
                {detail}
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {health && (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    status?.ok ? "bg-emerald-500" : "bg-slate-300",
                  )}
                />
              )}{" "}
              {sub}
            </p>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="flex items-center justify-between border-b px-5 pt-4">
          <div className="flex items-center gap-5">
            <button
              className="flex items-center gap-2 border-b-2 border-primary pb-4 text-xs font-semibold text-primary"
              onClick={() => setNamespace("all")}
            >
              All tables
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px]">
                {tables.length}
              </span>
            </button>
            <button
              className="pb-4 text-xs text-muted-foreground hover:text-primary"
              onClick={() => navigate("namespaces")}
            >
              Namespaces
            </button>
          </div>
          <span className="mb-4 hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
            <Circle className="size-2 fill-blue-500 text-blue-500" />
            Lakekeeper catalog
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative min-w-40 flex-1 sm:max-w-72">
            <Search className="absolute left-3 top-2.5 size-3.5 text-slate-400" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs shadow-none"
              placeholder="Search tables…"
              aria-label="Search tables"
            />
          </div>
          <select
            aria-label="Filter by namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="max-w-48 text-xs"
          >
            <option value="all">All namespaces</option>
            {namespaces.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1 text-muted-foreground">
              <ArrowDown size={13} />
              <select
                aria-label="Sort tables"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="border-0 bg-transparent pl-1 text-xs shadow-none"
              >
                <option value="name">Name</option>
                <option value="updated">Last updated</option>
                <option value="rows">Row count</option>
              </select>
            </div>
            <div className="flex rounded-lg border p-0.5">
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={cn(
                  "rounded-md p-1.5",
                  view === "list"
                    ? "bg-slate-100 text-foreground"
                    : "text-slate-400",
                )}
              >
                <List size={14} />
              </button>
              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={cn(
                  "rounded-md p-1.5",
                  view === "grid"
                    ? "bg-slate-100 text-foreground"
                    : "text-slate-400",
                )}
              >
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : !filtered.length ? (
          <Empty
            search={!!search || namespace !== "all"}
            title={
              search || namespace !== "all"
                ? "No matching tables"
                : error && !loaded
                  ? "Catalog unavailable"
                  : "A fresh start for your data"
            }
            text={
              search || namespace !== "all"
                ? "Try another search or choose a different namespace."
                : error && !loaded
                  ? "Reconnect to your backend to browse the catalog."
                  : "Create a namespace, define a table, or import a Parquet file. Your lakehouse starts here."
            }
            action={
              search || namespace !== "all" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setNamespace("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => modal({ kind: "namespace" })}
                >
                  <Plus />
                  Create namespace
                </Button>
              )
            }
          />
        ) : view === "list" ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TABLE NAME</th>
                  <th>NAMESPACE</th>
                  <th>FORMAT</th>
                  <th className="text-right">ROWS</th>
                  <th>LAST UPDATED</th>
                  <th>
                    <span className="sr-only">Open table</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={`${t.namespace}.${t.name}`}>
                    <td>
                      <button
                        onClick={() => openTable(t)}
                        className="group flex items-center gap-3 text-left"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-blue-100/60 bg-blue-50/70 text-blue-500">
                          <Table2 size={15} strokeWidth={1.7} />
                        </span>
                        <span>
                          <span className="block font-medium group-hover:text-primary">
                            {t.name}
                          </span>
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            {t.columns.length} columns
                            {t.partition_by.length
                              ? ` · ${t.partition_by.length} partitions`
                              : " · Unpartitioned"}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td>
                      <button
                        onClick={() => setNamespace(t.namespace)}
                        className="rounded-md border border-slate-200/70 bg-slate-50/50 px-2 py-1 text-[10px] text-slate-500 hover:border-blue-200 hover:text-primary"
                      >
                        {t.namespace}
                      </button>
                    </td>
                    <td>
                      <span className="pill">
                        Iceberg
                        <span className="text-blue-400">
                          v{t.format_version}
                        </span>
                      </span>
                    </td>
                    <td className="text-right font-mono text-[11px]">
                      {number(t.row_count)}
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {date(t.snapshot_at)}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${t.name}`}
                        onClick={() => openTable(t)}
                      >
                        <ChevronRight className="text-slate-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 border-t p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <button
                key={`${t.namespace}.${t.name}`}
                onClick={() => openTable(t)}
                className="rounded-xl border p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <Table2 className="size-5 text-primary" />
                  <span className="pill">Iceberg v{t.format_version}</span>
                </div>
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.namespace}
                </p>
                <div className="mt-5 flex justify-between border-t pt-3 text-[11px] text-muted-foreground">
                  <span>{number(t.row_count)} rows</span>
                  <span>{t.columns.length} columns</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <p className="text-[10px] text-muted-foreground">
            {filtered.length
              ? `Showing ${currentPage * 8 + 1}–${Math.min(currentPage * 8 + 8, filtered.length)} of ${filtered.length} tables`
              : "0 tables"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="size-6"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPageIndex(currentPage - 1)}
            >
              <ChevronLeft className="size-3!" />
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {currentPage + 1} of {pages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-6"
              aria-label="Next page"
              disabled={currentPage >= pages - 1}
              onClick={() => setPageIndex(currentPage + 1)}
            >
              <ChevronRight className="size-3!" />
            </Button>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold">
              <Clock3 className="size-3.5 text-slate-400" />
              Latest snapshots
            </h2>
            <TextLink
              onClick={() => {
                setSort("updated");
                setNamespace("all");
                setSearch("");
              }}
            >
              View tables
            </TextLink>
          </div>
          {recent.length ? (
            <div className="space-y-4">
              {recent.map((t) => (
                <button
                  onClick={() => openTable(t)}
                  key={`${t.namespace}.${t.name}`}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-primary">
                    <Layers3 size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">
                      {t.namespace}.{t.name}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {number(t.row_count)} rows in current snapshot
                    </span>
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {date(t.snapshot_at)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-24 items-center gap-3 rounded-lg bg-slate-50 px-4">
              <Clock3 className="size-5 text-slate-300" />
              <p className="text-xs leading-6 text-muted-foreground">
                Snapshots will appear here when you add data to a table.
              </p>
            </div>
          )}
        </section>
        <section className="relative overflow-hidden rounded-xl border border-blue-100 bg-[#f0f5ff] p-5">
          <div
            aria-hidden="true"
            className="absolute -right-3 bottom-0 rotate-[-15deg] text-blue-200/40"
          >
            <Layers3 size={150} strokeWidth={0.7} />
          </div>
          <span className="relative text-[9px] font-semibold tracking-[.12em] text-blue-500">
            FROM DATA TO DISCOVERY
          </span>
          <h2 className="relative mt-3 text-base font-semibold tracking-tight">
            Good questions deserve great data.
          </h2>
          <p className="relative mt-2 max-w-72 text-[11px] leading-5 text-slate-500">
            Explore your tables with SQL. Fast, familiar queries, powered by
            DuckDB.
          </p>
          <Button
            variant="outline"
            className="relative mt-4 h-8 border-blue-200 text-[11px] text-primary"
            onClick={() => navigate("query")}
          >
            Open SQL editor
            <ArrowRight />
          </Button>
        </section>
      </div>
      <footer className="mt-7 flex justify-between text-[9px] text-slate-400">
        <span>Built on open standards.</span>
        <span>
          Apache Iceberg <span className="mx-2">·</span> Lakekeeper{" "}
          <span className="mx-2">·</span> DuckDB
        </span>
      </footer>
    </div>
  );
}
export function NamespacesPage({
  tables,
  namespaces,
  loading,
  modal,
  chooseNamespace,
}: {
  tables: LakeTable[];
  namespaces: string[];
  loading: boolean;
  modal: (m: Modal) => void;
  chooseNamespace: (n: string) => void;
}) {
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Manage / Catalog"
        title="Namespaces"
        description="Give your tables a home. Organize data into meaningful collections."
        actions={
          <Button onClick={() => modal({ kind: "namespace" })}>
            <Plus />
            Create namespace
          </Button>
        }
      />
      {loading ? (
        <Loading />
      ) : namespaces.length === 0 ? (
        <div className="panel">
          <Empty
            title="Your first collection starts here"
            text="Create a namespace to organize tables in your lakehouse."
            action={
              <Button onClick={() => modal({ kind: "namespace" })}>
                <Plus />
                Create namespace
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {namespaces.map((n) => {
            const items = tables.filter((t) => t.namespace === n);
            return (
              <div key={n} className="panel p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-blue-50 p-2.5 text-primary">
                    <Folder size={20} />
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete namespace ${n}`}
                    disabled={items.length > 0}
                    onClick={() =>
                      modal({ kind: "delete-namespace", namespace: n })
                    }
                  >
                    <Trash2 className="text-slate-400" />
                  </Button>
                </div>
                <button
                  onClick={() => chooseNamespace(n)}
                  className="mt-5 block max-w-full truncate text-base font-semibold hover:text-primary"
                >
                  {n}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {items.length} tables <span className="mx-2">·</span>{" "}
                  {number(items.reduce((s, t) => s + (t.row_count || 0), 0))}{" "}
                  rows
                </p>
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <TextLink onClick={() => chooseNamespace(n)}>
                    Explore tables
                  </TextLink>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => modal({ kind: "table", namespace: n })}
                  >
                    <Plus />
                    Table
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function ServicesPage({
  status,
  error,
  refreshing,
  reload,
}: {
  status: Status | null;
  error: string;
  refreshing: boolean;
  reload: () => void;
}) {
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="Manage / Infrastructure"
        title="Service health"
        description="A clear view of the services behind your lakehouse."
        actions={
          <Button variant="outline" disabled={refreshing} onClick={reload}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            Refresh status
          </Button>
        }
      />
      {error && <ErrorPanel error={error} retry={reload} />}
      <div
        className={cn(
          "mb-6 flex items-center gap-4 rounded-xl border p-5",
          status?.ok ? "border-emerald-200 bg-emerald-50/60" : "bg-white",
        )}
      >
        <span
          className={cn(
            "rounded-full p-2",
            status?.ok
              ? "bg-emerald-100 text-emerald-600"
              : "bg-slate-100 text-slate-400",
          )}
        >
          <Activity size={23} />
        </span>
        <div>
          <h2 className="text-sm font-semibold">
            {status?.ok
              ? "All systems operational"
              : status
                ? "Some services need attention"
                : "Service status unavailable"}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {status
              ? `Warehouse: ${status.warehouse} · ${status.services.filter((s) => s.ok).length} of ${status.services.length} services healthy`
              : "Connect to the backend to check your infrastructure."}
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {status?.services.map((s, i) => {
          const Icon = [Database, HardDrive, Server, Activity][i % 4];
          return (
            <div key={s.name} className="panel p-5">
              <div className="flex items-center gap-3">
                <Icon className="size-5 text-primary" />
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <span
                  className={cn(
                    "ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10px]",
                    s.ok
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-700",
                  )}
                >
                  {s.ok ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                  {s.ok ? "Operational" : "Unavailable"}
                </span>
              </div>
              <p className="mt-4 break-words whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                {s.detail}
              </p>
              {s.port && (
                <p className="mt-4 border-t pt-3 font-mono text-[10px] text-slate-400">
                  Port {s.port}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
