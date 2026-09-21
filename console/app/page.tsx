"use client";
import {
  Alert,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  KpiCard,
  Link,
  PageContent,
  PageHeader,
  Button,
} from "@nowquant/nqui";
import {
  Activity,
  ArrowRight,
  FolderOpen,
  Layers,
  RefreshCw,
  Table2,
} from "lucide-react";
import { TableList } from "@/components/table-list";
import { useLake } from "@/components/lake-provider";
import { number } from "@/lib/utils";

export default function Overview() {
  const {
    status,
    namespaces,
    tables,
    loading,
    error,
    statusError,
    updated,
    refresh,
  } = useLake();
  const available = !!updated;
  const totalRows = tables.reduce(
    (sum, table) => sum + (table.row_count || 0),
    0,
  );
  const healthy = status?.services.filter((service) => service.ok).length;
  const stats = [
    {
      label: "Tables",
      value: available ? number(tables.length) : "—",
      icon: <Table2 />,
      note: "Apache Iceberg tables",
    },
    {
      label: "Namespaces",
      value: available ? number(namespaces.length) : "—",
      icon: <FolderOpen />,
      note: "Across your data catalog",
    },
    {
      label: "Total rows",
      value: available ? number(totalRows) : "—",
      icon: <Layers />,
      note: tables.some((table) => table.row_count == null)
        ? "Known row counts only"
        : "From current table snapshots",
    },
    {
      label: "Healthy services",
      value: status ? `${healthy} / ${status.services.length}` : "—",
      icon: <Activity />,
      note: status?.ok
        ? "All services are operational"
        : "View service health and connectivity",
    },
  ];
  const recent = [...tables]
    .sort((a, b) => (b.snapshot_at || "").localeCompare(a.snapshot_at || ""))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your lakehouse at a glance. Explore your data and keep things running smoothly."
        actions={
          <Button
            variant="outline"
            startContent={<RefreshCw />}
            isLoading={loading}
            onPress={refresh}
          >
            Refresh
          </Button>
        }
      />
      <PageContent>
        {(error || statusError) && (
          <Alert
            color="warning"
            title={error || statusError}
            description={
              updated ? "Showing previously loaded data." : undefined
            }
          />
        )}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((stat) => (
            <KpiCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              caption={stat.note}
              isLoading={loading && !available}
            />
          ))}
        </div>
        <Card>
          <CardHeader className="items-center">
            <CardTitle>Recently updated tables</CardTitle>
            <Link href="/catalog" className="text-sm">
              View catalog
              <ArrowRight />
            </Link>
          </CardHeader>
          <TableList
            tables={recent}
            isLoading={loading && !available}
            emptyTitle={error ? "Waiting for your data" : "No tables yet"}
            emptyDescription={
              error
                ? "Connect the data service and refresh to load your catalog."
                : "Create a namespace in the catalog, then add a table or import a Parquet file."
            }
          />
          {updated && (
            <CardFooter className="text-muted text-xs">
              Last synced at{" "}
              {updated.toLocaleTimeString("en-US", { hour12: false })}
            </CardFooter>
          )}
        </Card>
      </PageContent>
    </>
  );
}
