import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Database,
  Folder,
  Layers3,
  Menu,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormModal, type Modal } from "@/components/forms";
import { ErrorPanel } from "@/components/shared";
import { QueryPage, tableSQL } from "@/components/query";
import { ImportPage } from "@/components/import";
import { TableDetail } from "@/components/table-detail";
import {
  CatalogPage,
  NamespacesPage,
  ServicesPage,
} from "@/components/catalog";
import {
  api,
  nsPath,
  tablePath,
  errorMessage,
  type LakeTable,
  type Status,
} from "@/lib/api";
import { cn } from "@/lib/utils";
export type Page = "catalog" | "query" | "imports" | "namespaces" | "services";
const pages: Page[] = ["catalog", "query", "imports", "namespaces", "services"];
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "catalog", label: "Data catalog", icon: Database },
  { id: "query", label: "SQL editor", icon: Code2 },
  { id: "imports", label: "Import data", icon: ArrowDownToLine },
  { id: "namespaces", label: "Namespaces", icon: Folder },
  { id: "services", label: "Services", icon: Activity },
];
export default function App() {
  const [page, setPage] = useState<Page>(() =>
    pages.includes(window.location.hash.slice(1) as Page)
      ? (window.location.hash.slice(1) as Page)
      : "catalog",
  );
  const [namespaces, setNamespaces] = useState<string[]>([]),
    [tables, setTables] = useState<LakeTable[]>([]),
    [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [statusError, setStatusError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<Modal>(null),
    [namespace, setNamespace] = useState("all"),
    [mobileOpen, setMobileOpen] = useState(false),
    [querySQL, setQuerySQL] = useState(""),
    [queryKey, setQueryKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null),
    requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    const statusPromise = api<Status>("/status")
      .then((s) => {
        if (id === requestId.current) {
          setStatus(s);
          setStatusError("");
        }
      })
      .catch((e) => {
        if (id === requestId.current) {
          setStatus(null);
          setStatusError(errorMessage(e));
        }
      });
    try {
      const ns = await api<string[]>("/namespaces");
      const groups = await Promise.allSettled(
        ns.map(async (n) => {
          const names = await api<string[]>(`${nsPath(n)}/tables`);
          const details = await Promise.allSettled(
            names.map((t) => api<LakeTable>(tablePath(n, t))),
          );
          return {
            tables: details.flatMap((r) =>
              r.status === "fulfilled" ? [r.value] : [],
            ),
            errors: details.flatMap((r) =>
              r.status === "rejected" ? [errorMessage(r.reason)] : [],
            ),
          };
        }),
      );
      if (id !== requestId.current) return;
      const items = groups.flatMap((g) =>
        g.status === "fulfilled" ? g.value.tables : [],
      );
      const errors = groups.flatMap((g) =>
        g.status === "fulfilled" ? g.value.errors : [errorMessage(g.reason)],
      );
      setNamespaces(ns);
      setTables(items);
      setLoaded(true);
      setError(
        errors.length ? `Some tables could not be loaded. ${errors[0]}` : "",
      );
      setRevision((r) => r + 1);
      setSelected((s) =>
        s && items.some((t) => `${t.namespace}.${t.name}` === s) ? s : null,
      );
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    await statusPromise;
    if (id === requestId.current) setRefreshing(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const navigate = (p: Page) => {
    setPage(p);
    setSelected(null);
    setMobileOpen(false);
    window.location.hash = p;
  };
  const focusSearch = () => {
    navigate("catalog");
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  useEffect(() => {
    const listener = () => {
      const p = window.location.hash.slice(1) as Page;
      if (pages.includes(p)) {
        setPage(p);
        setSelected(null);
      }
    };
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("catalog");
        setSelected(null);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("hashchange", listener);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("hashchange", listener);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  const selectedTable = useMemo(
    () => tables.find((t) => `${t.namespace}.${t.name}` === selected),
    [tables, selected],
  );
  const queryTable = (t: LakeTable) => {
    setQuerySQL(tableSQL(t));
    setQueryKey((k) => k + 1);
    navigate("query");
  };
  const chooseNamespace = (ns: string) => {
    setNamespace(ns);
    navigate("catalog");
  };
  const openTable = (t: LakeTable) => setSelected(`${t.namespace}.${t.name}`);
  const dot = status?.ok
    ? "bg-emerald-500"
    : statusError || status
      ? "bg-amber-400"
      : "bg-slate-300";
  return (
    <div className="min-h-dvh bg-[#f8fafc] text-foreground">
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r bg-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <a
          href="#catalog"
          onClick={() => navigate("catalog")}
          className="flex h-[77px] shrink-0 items-center gap-3 px-6"
        >
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-white shadow-[0_3px_8px_#2563eb25]">
            <Layers3 className="size-[23px]" strokeWidth={1.8} />
          </span>
          <span className="text-[19px] font-semibold tracking-[-.04em]">
            NQ Lake<span className="ml-1 text-primary">.</span>
          </span>
        </a>
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => navigate("services")}
            className="mx-4 mb-7 flex w-[200px] items-center gap-3 rounded-lg border bg-[#fafbfc] px-3 py-3 text-left"
          >
            <span className="flex size-7 items-center justify-center rounded-md border bg-white">
              <Boxes className="size-4 text-slate-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {status?.warehouse || "Lakehouse"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Local workspace
              </p>
            </div>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </button>
          <div className="px-4">
            {[
              ["WORKSPACE", navigation.slice(0, 3)],
              ["MANAGE", navigation.slice(3)],
            ].map(([label, items]) => (
              <div key={label as string} className="mb-7">
                <p className="mb-3 px-3 text-[9px] font-semibold tracking-[.15em] text-slate-400">
                  {label as string}
                </p>
                <nav className="space-y-1">
                  {(items as typeof navigation).map(
                    ({ id, label: name, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => navigate(id)}
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-xs font-medium transition-colors",
                          page === id
                            ? "bg-[#edf3ff] text-primary"
                            : "text-[#69758b] hover:bg-slate-50 hover:text-foreground",
                        )}
                      >
                        <Icon size={17} strokeWidth={1.7} />
                        {name}
                        {id === "catalog" && loaded && (
                          <span
                            className={cn(
                              "ml-auto rounded px-1.5 py-0.5 text-[10px]",
                              page === id ? "bg-blue-100/70" : "bg-slate-100",
                            )}
                          >
                            {tables.length}
                          </span>
                        )}
                        {id === "services" && (
                          <span
                            className={cn("ml-auto size-1.5 rounded-full", dot)}
                          />
                        )}
                      </button>
                    ),
                  )}
                </nav>
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0 p-4">
          <div className="relative mb-4 hidden overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-[#f9fbff] p-4 min-[900px]:block">
            <div className="absolute -right-5 -top-4 size-20 rounded-full border-[12px] border-blue-100/30" />
            <Layers3 className="mb-3 size-5 text-primary" />
            <p className="text-xs font-semibold">Your data. One place.</p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Open formats. Endless possibilities.
            </p>
            <button
              onClick={() => navigate("imports")}
              className="mt-3 flex items-center gap-2 text-[11px] font-medium text-primary"
            >
              Bring your data in
              <ArrowRight size={12} />
            </button>
          </div>
          <button
            onClick={() => navigate("services")}
            className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-[10px] text-muted-foreground"
          >
            <span className={cn("size-1.5 rounded-full", dot)} />
            {status?.ok
              ? "All systems operational"
              : statusError
                ? "Backend unavailable"
                : status
                  ? "Services need attention"
                  : "Checking services…"}
            <ArrowUpRight size={12} className="ml-auto" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t px-5 py-4">
          <div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            NQ
          </div>
          <div>
            <p className="text-[11px] font-medium">Local console</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              NQ Lake · v0.1.0
            </p>
          </div>
          <span className="ml-auto rounded border px-1.5 py-0.5 text-[8px] tracking-wide text-slate-400">
            LOCAL
          </span>
        </div>
      </aside>
      <div className="lg:pl-[232px]">
        <header className="flex h-[65px] items-center justify-between border-b bg-white px-5 md:px-9">
          <div className="flex items-center gap-3 text-[11px]">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <span className="text-muted-foreground">Workspace</span>
            <ChevronRight className="size-3 text-slate-300" />
            <span className="font-medium">
              {navigation.find((n) => n.id === page)?.label}
            </span>
            {selectedTable && (
              <>
                <ChevronRight className="size-3 text-slate-300" />
                <span className="hidden max-w-44 truncate sm:block">
                  {selectedTable.name}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-primary" />
              Local environment
            </span>
            <span className="hidden h-4 border-l sm:block" />
            <button
              aria-label="Search tables"
              onClick={focusSearch}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Search size={15} />
              <kbd className="hidden rounded border bg-slate-50 px-1.5 py-0.5 text-[9px] sm:block">
                ⌘ K
              </kbd>
            </button>
            <button
              aria-label="Refresh workspace"
              className="text-muted-foreground hover:text-primary disabled:opacity-50"
              disabled={refreshing}
              onClick={() => void reload()}
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-5 py-8 md:px-9 md:py-9">
          {error && <ErrorPanel error={error} retry={() => void reload()} />}
          {page === "catalog" &&
            (selectedTable ? (
              <TableDetail
                table={selectedTable}
                back={() => setSelected(null)}
                query={() => queryTable(selectedTable)}
                modal={setModal}
                refresh={() => void reload()}
                revision={revision}
              />
            ) : (
              <CatalogPage
                tables={tables}
                namespaces={namespaces}
                status={status}
                statusError={statusError}
                loading={loading}
                loaded={loaded}
                error={error}
                namespace={namespace}
                setNamespace={setNamespace}
                searchRef={searchRef}
                navigate={navigate}
                modal={setModal}
                openTable={openTable}
              />
            ))}
          <div hidden={page !== "query"}>
            <QueryPage key={queryKey} tables={tables} initialSQL={querySQL} />
          </div>
          {page === "imports" && (
            <ImportPage namespaces={namespaces} done={() => void reload()} />
          )}
          {page === "namespaces" && (
            <NamespacesPage
              tables={tables}
              namespaces={namespaces}
              loading={loading}
              modal={setModal}
              chooseNamespace={chooseNamespace}
            />
          )}
          {page === "services" && (
            <ServicesPage
              status={status}
              error={statusError}
              refreshing={refreshing}
              reload={() => void reload()}
            />
          )}
        </main>
      </div>
      <FormModal
        modal={modal}
        close={() => setModal(null)}
        namespaces={namespaces}
        done={() => {
          if (modal?.kind === "rename" || modal?.kind === "delete-table")
            setSelected(null);
          void reload();
        }}
      />
      {mobileOpen && (
        <Button
          className="fixed left-[245px] top-5 z-50 lg:hidden"
          size="icon"
          variant="outline"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
