"use client";
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
  Code,
  PageContent,
  PageHeader,
} from "@nowquant/nqui";
import {
  Database,
  Layers,
  RefreshCw,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useLake } from "@/components/lake-provider";

const services = [
  {
    name: "lakekeeper",
    title: "Lakekeeper",
    description: "Iceberg REST Catalog",
    icon: <Database />,
  },
  {
    name: "minio",
    title: "MinIO",
    description: "S3-compatible object storage",
    icon: <Layers />,
  },
  {
    name: "postgres",
    title: "PostgreSQL",
    description: "Catalog metadata storage",
    icon: <Server />,
  },
  {
    name: "catalog",
    title: "Iceberg Catalog",
    description: "Namespaces and table catalog",
    icon: <Database />,
  },
  {
    name: "duckdb",
    title: "DuckDB",
    description: "Read-only SQL query engine",
    icon: <TerminalSquare />,
  },
];
export default function Services() {
  const { status, statusError, loading, refresh } = useLake();
  return (
    <>
      <PageHeader
        title="Services"
        description="Monitor the services that power your local lakehouse."
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
        {statusError && (
          <Alert
            color="warning"
            title={statusError}
            actions={
              <Button size="sm" variant="outline" onPress={refresh}>
                Retry
              </Button>
            }
          />
        )}
        <Alert
          variant="outline"
          color={
            loading
              ? "neutral"
              : status?.ok
                ? "success"
                : status
                  ? "warning"
                  : "neutral"
          }
          title={
            loading
              ? "Checking services"
              : status?.ok
                ? "All systems operational"
                : status
                  ? "Some services need attention"
                  : "Waiting for the data service"
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((item) => {
            const state = status?.services.find((s) => s.name === item.name);
            return (
              <Card key={item.name}>
                <CardHeader className="items-center">
                  <CardIcon color="primary">{item.icon}</CardIcon>
                  <Chip
                    variant="dot"
                    color={
                      loading || !state
                        ? "neutral"
                        : state.ok
                          ? "success"
                          : "warning"
                    }
                  >
                    {loading
                      ? "Checking"
                      : state?.ok
                        ? "Operational"
                        : state
                          ? "Degraded"
                          : "Disconnected"}
                  </Chip>
                </CardHeader>
                <CardBody>
                  <CardTitle description={item.description}>
                    {item.title}
                  </CardTitle>
                  <p className="mt-4 break-words text-muted text-sm">
                    {state?.detail || "No response received yet"}
                  </p>
                </CardBody>
                <CardFooter>
                  <Code>
                    {state?.port
                      ? `127.0.0.1:${state.port}`
                      : item.name === "duckdb"
                        ? "In-process query engine"
                        : item.name === "catalog"
                          ? "REST catalog connection"
                          : "Local service"}
                  </Code>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </PageContent>
    </>
  );
}
