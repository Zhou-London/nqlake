"use client";
import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Search, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLake } from "@/components/lake-provider";
import {
  PageHeading,
  ErrorBanner,
  LoadingState,
  EmptyState,
  RefreshButton,
} from "@/components/shared";
import {
  NewNamespaceButton,
  NewTableButton,
} from "@/components/catalog-actions";
import { TableList } from "@/components/table-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { number } from "@/lib/utils";

export default function Catalog() {
  const { namespaces, tables, error, loading, updated, refresh } = useLake();
  const [view, setView] = useState("tables");
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("view") === "namespaces"
    )
      setView("namespaces");
  }, []);
  const [term, setTerm] = useState("");
  const [ns, setNs] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const filtered = tables
    .filter(
      (t) =>
        (ns === "all" || t.namespace === ns) &&
        `${t.namespace}.${t.name}`.toLowerCase().includes(term.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "rows"
          ? (b.row_count || 0) - (a.row_count || 0)
          : (b.snapshot_at || "").localeCompare(a.snapshot_at || ""),
    );
  const maxPage = Math.max(0, Math.ceil(filtered.length / 10) - 1);
  const currentPage = Math.min(page, maxPage);
  async function removeNamespace() {
    if (!deleting) return;
    setBusy(true);
    setDeleteError("");
    try {
      await api(`/namespaces/${encodeURIComponent(deleting)}`, {
        method: "DELETE",
      });
      toast.success("Empty namespace deleted.");
      setDeleting(null);
      await refresh();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Data catalog"
        title="Data catalog"
        description=""
      >
        <NewNamespaceButton />
        <NewTableButton namespace={ns === "all" ? undefined : ns} />
      </PageHeading>
      {error && (
        <ErrorBanner
          message={error + (updated ? " Showing previously loaded data." : "")}
          onRetry={refresh}
        />
      )}
      <Tabs value={view} onValueChange={setView}>
        <div className="mb-5 flex items-center justify-between border-b pb-4">
          <TabsList>
            <TabsTrigger value="tables">
              <Table2 size={14} />
              Tables <span className="ml-1 text-[10px]">{tables.length}</span>
            </TabsTrigger>
            <TabsTrigger value="namespaces">
              <FolderOpen size={14} />
              Namespaces{" "}
              <span className="ml-1 text-[10px]">{namespaces.length}</span>
            </TabsTrigger>
          </TabsList>
          <RefreshButton loading={loading} onClick={refresh} />
        </div>
        <TabsContent value="tables">
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-44 flex-1 sm:max-w-xs">
                <Search
                  size={14}
                  className="absolute left-3 top-3 text-muted-foreground"
                />
                <Input
                  aria-label="Filter tables"
                  className="pl-9"
                  placeholder="Search tables or namespaces…"
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <select
                aria-label="Filter by namespace"
                className="native-select"
                value={ns}
                onChange={(e) => {
                  setNs(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All namespaces</option>
                {namespaces.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <select
                aria-label="Sort by"
                className="native-select sm:ml-auto"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="updated">Last updated</option>
                <option value="name">Name A → Z</option>
                <option value="rows">Most rows</option>
              </select>
            </div>
            {loading && !updated ? (
              <LoadingState />
            ) : (
              <TableList
                tables={filtered.slice(currentPage * 10, currentPage * 10 + 10)}
                emptyTitle={
                  error
                    ? "Could not load tables"
                    : term || ns !== "all"
                      ? "No matching tables"
                      : "Your data catalog starts here"
                }
                emptyDescription={
                  error
                    ? "Check the backend connection and try again."
                    : term || ns !== "all"
                      ? "Try a different search or namespace."
                      : "Create a namespace, then create a table or import Parquet."
                }
              />
            )}
            <div className="flex items-center justify-between border-t px-5 py-3 text-[11px] text-muted-foreground">
              <span>{number(filtered.length)} tables</span>
              <div className="flex items-center gap-3">
                <span>
                  {currentPage + 1} / {maxPage + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= maxPage}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="namespaces">
          {loading && !updated ? (
            <LoadingState />
          ) : !namespaces.length ? (
            <div className="panel">
              <EmptyState
                icon={FolderOpen}
                title={
                  error
                    ? "Could not load namespaces"
                    : "Create your first namespace"
                }
                description="Organize data into namespaces such as raw, staging, or analytics."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {namespaces.map((namespace) => {
                const items = tables.filter((t) => t.namespace === namespace);
                return (
                  <div key={namespace} className="panel p-5">
                    <div className="flex items-center justify-between">
                      <FolderOpen
                        size={22}
                        strokeWidth={1.5}
                        className="text-primary"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete namespace ${namespace}`}
                        title={
                          items.length
                            ? "Only empty namespaces can be deleted"
                            : "Delete empty namespace"
                        }
                        disabled={items.length > 0}
                        onClick={() => {
                          setDeleting(namespace);
                          setDeleteError("");
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <h3 className="mb-4 mt-3 break-all font-medium">
                      {namespace}
                    </h3>
                    <div className="flex gap-5 text-xs text-muted-foreground">
                      <span>{items.length} tables</span>
                      <span>
                        {number(
                          items.reduce((sum, t) => sum + (t.row_count || 0), 0),
                        )}{" "}
                        rows
                      </span>
                    </div>
                    <div className="mt-5 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNs(namespace);
                          setPage(0);
                          setView("tables");
                        }}
                      >
                        Browse tables
                        <ArrowRight className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete empty namespace</DialogTitle>
          <DialogDescription>
            Delete {deleting}? The backend will verify that the namespace is
            empty.
          </DialogDescription>
          {deleteError && <ErrorBanner message={deleteError} />}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={removeNamespace}
            >
              {busy ? "Deleting…" : "Delete namespace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
