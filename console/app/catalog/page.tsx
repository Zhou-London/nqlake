"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  IconButton,
  Modal,
  PageContent,
  PageHeader,
  Skeleton,
  Stat,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  toast,
  type DataGridColumnFilter,
} from "@nowquant/nqui";
import {
  ArrowRight,
  FolderOpen,
  RefreshCw,
  Table2,
  Trash2,
} from "lucide-react";
import { useLake } from "@/components/lake-provider";
import {
  NewNamespaceButton,
  NewTableButton,
} from "@/components/catalog-actions";
import { TableList } from "@/components/table-list";
import { api } from "@/lib/api";
import { number } from "@/lib/utils";

export default function Catalog() {
  const { namespaces, tables, error, loading, updated, refresh } = useLake();
  const [view, setView] = useState("tables");
  const [filters, setFilters] = useState<DataGridColumnFilter[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("view") === "namespaces"
    )
      setView("namespaces");
  }, []);
  const namespaceFilter = filters.find(
    (item) => item.id === "namespace",
  )?.value;
  const selectedNamespace =
    Array.isArray(namespaceFilter) && namespaceFilter.length === 1
      ? String(namespaceFilter[0])
      : undefined;
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
      <PageHeader
        title="Data catalog"
        description="Browse tables, organize namespaces, and manage your data."
        actions={
          <>
            <Button
              variant="outline"
              startContent={<RefreshCw />}
              isLoading={loading}
              onPress={refresh}
            >
              Refresh
            </Button>
            <NewNamespaceButton />
            <NewTableButton namespace={selectedNamespace} />
          </>
        }
      />
      <PageContent>
        {error && (
          <Alert
            color="warning"
            title={error}
            description={
              updated ? "Showing previously loaded data." : undefined
            }
            actions={
              <Button size="sm" variant="outline" onPress={refresh}>
                Retry
              </Button>
            }
          />
        )}
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => setView(String(key))}
        >
          <TabList aria-label="Catalog views">
            <Tab id="tables">
              <Table2 />
              Tables
              <Chip size="sm" color="neutral">
                {tables.length}
              </Chip>
            </Tab>
            <Tab id="namespaces">
              <FolderOpen />
              Namespaces
              <Chip size="sm" color="neutral">
                {namespaces.length}
              </Chip>
            </Tab>
          </TabList>
          <TabPanel id="tables">
            <Card>
              <TableList
                tables={tables}
                isLoading={loading && !updated}
                toolbar={{ search: true, filters: true }}
                pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50] }}
                columnFilters={filters}
                onColumnFiltersChange={setFilters}
                emptyTitle={
                  error
                    ? "Could not load tables"
                    : "Your data catalog starts here"
                }
                emptyDescription={
                  error
                    ? "Check the backend connection and try again."
                    : "Create a namespace, then create a table or import Parquet."
                }
              />
            </Card>
          </TabPanel>
          <TabPanel id="namespaces">
            {loading && !updated ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-48" />
                ))}
              </div>
            ) : !namespaces.length ? (
              <Card>
                <EmptyState
                  icon={<FolderOpen />}
                  title={
                    error
                      ? "Could not load namespaces"
                      : "Create your first namespace"
                  }
                  description="Organize data into namespaces such as raw, staging, or analytics."
                  actions={<NewNamespaceButton />}
                />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {namespaces.map((namespace) => {
                  const items = tables.filter((t) => t.namespace === namespace);
                  const rows = items.reduce(
                    (sum, t) => sum + (t.row_count || 0),
                    0,
                  );
                  return (
                    <Card key={namespace}>
                      <CardHeader className="items-center">
                        <CardIcon color="primary">
                          <FolderOpen />
                        </CardIcon>
                        <IconButton
                          aria-label={`Delete namespace ${namespace}`}
                          size="sm"
                          disabledReason={
                            items.length ? "Namespace has tables" : undefined
                          }
                          onPress={() => {
                            setDeleting(namespace);
                            setDeleteError("");
                          }}
                        >
                          <Trash2 />
                        </IconButton>
                      </CardHeader>
                      <CardBody className="flex flex-col gap-4">
                        <CardTitle className="break-all whitespace-normal">
                          {namespace}
                        </CardTitle>
                        <div className="flex gap-6">
                          <Stat label="Tables" value={number(items.length)} />
                          <Stat label="Rows" value={number(rows)} />
                        </div>
                      </CardBody>
                      <CardFooter>
                        <Button
                          variant="ghost"
                          size="sm"
                          endContent={<ArrowRight />}
                          onPress={() => {
                            setFilters([
                              { id: "namespace", value: [namespace] },
                            ]);
                            setView("tables");
                          }}
                        >
                          Browse tables
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabPanel>
        </Tabs>
      </PageContent>
      <Modal
        size="sm"
        isOpen={!!deleting}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleting(null);
        }}
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Dialog>
          <DialogHeader
            title="Delete empty namespace"
            description={`Delete ${deleting}? The backend will verify that the namespace is empty.`}
          />
          {deleteError && (
            <DialogBody>
              <Alert color="error" title={deleteError} />
            </DialogBody>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              isDisabled={busy}
              onPress={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button color="error" isLoading={busy} onPress={removeNamespace}>
              Delete namespace
            </Button>
          </DialogFooter>
        </Dialog>
      </Modal>
    </>
  );
}
