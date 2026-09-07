import { parseLakeJson } from "@/lib/data.mjs";
export type Service = {
  name: string;
  ok: boolean;
  detail: string;
  port: number | null;
};
export type Status = { ok: boolean; warehouse: string; services: Service[] };
export type Column = {
  id: number;
  name: string;
  type: string;
  required: boolean;
  doc: string | null;
};
export type LakeTable = {
  namespace: string;
  name: string;
  format_version: number;
  location: string;
  columns: Column[];
  partition_by: string[];
  properties: Record<string, string>;
  snapshot_id: number | string | null;
  snapshot_at: string | null;
  row_count: number | null;
  snapshot_count: number;
};
export type Rows = {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
};
export type Repair = {
  column: string;
  from_type: string;
  to_type: string;
  reason: string;
  lossy: boolean;
};
export type Inspection = {
  rows: number;
  columns: { name: string; parquet_type: string; iceberg_type: string }[];
  repairs: Repair[];
};
export type UploadResult = {
  namespace: string;
  table: string;
  created: boolean;
  mode: string;
  rows: number;
  snapshot_id: number | string | null;
  repairs: Repair[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/lake${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body;
  try {
    body = parseLakeJson(text);
  } catch {
    throw new Error(
      `The data service returned an invalid response (${response.status})`,
    );
  }
  if (!response.ok) {
    const details =
      body?.problems?.join("; ") ||
      (Array.isArray(body?.detail)
        ? body.detail.map((item: { msg: string }) => item.msg).join("; ")
        : body?.detail);
    throw new Error(
      [body?.error || `Request failed (${response.status})`, details]
        .filter(Boolean)
        .join(": "),
    );
  }
  return body as T;
}
export const tablePath = (namespace: string, name: string) =>
  `/namespaces/${encodeURIComponent(namespace)}/tables/${encodeURIComponent(name)}`;
export const tableHref = (namespace: string, name: string) =>
  `/catalog/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
export const tableSql = (namespace: string, name: string) =>
  `SELECT *\nFROM ${["lake", namespace, name].map((part) => `"${part.replaceAll('"', '""')}"`).join(".")}\nLIMIT 100;`;
