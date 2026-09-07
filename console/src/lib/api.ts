export interface Column {
  id: number;
  name: string;
  type: string;
  required: boolean;
  doc: string | null;
}
export interface LakeTable {
  namespace: string;
  name: string;
  format_version: number;
  location: string;
  columns: Column[];
  partition_by: string[];
  properties: Record<string, string>;
  snapshot_id: number | null;
  snapshot_at: string | null;
  row_count: number | null;
  snapshot_count: number;
}
export interface Rows {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
}
export interface Status {
  ok: boolean;
  warehouse: string;
  services: {
    name: string;
    ok: boolean;
    detail: string;
    port: number | null;
  }[];
}
export interface Inspection {
  rows: number;
  columns: { name: string; parquet_type: string; iceberg_type: string }[];
  repairs: {
    column: string;
    from_type: string;
    to_type: string;
    reason: string;
    lossy: boolean;
  }[];
}
export interface Upload extends Pick<Inspection, "rows" | "repairs"> {
  namespace: string;
  table: string;
  created: boolean;
  mode: string;
  snapshot_id: number | null;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error
        ? [data.error, ...(data.problems || [])].join("\n")
        : `Request failed (${response.status}). Check your backend connection.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const nsPath = (ns: string) => `/namespaces/${encodeURIComponent(ns)}`;
export const tablePath = (ns: string, table: string) =>
  `${nsPath(ns)}/tables/${encodeURIComponent(table)}`;
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
