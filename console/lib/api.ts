// Browser-side client of the console's /api routes, which forward to the
// Python backend. Every function throws ApiError with the backend's message.

import type {
  Inspect,
  Rows,
  Status,
  TableIn,
  TableInfo,
  TableRef,
  TableUpdateIn,
  Upload,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  problems: string[];
  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { cache: "no-store", ...init });
  } catch (error) {
    throw new ApiError(
      0,
      `The console could not be reached: ${describe(error)}`,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = body as {
      error?: string;
      problems?: string[];
      detail?: unknown;
    } | null;
    const message =
      error?.error ??
      (typeof error?.detail === "string" ? error.detail : null) ??
      (text || `HTTP ${response.status}`);
    throw new ApiError(response.status, message, error?.problems ?? []);
  }
  return body as T;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const seg = encodeURIComponent;

export const api = {
  status: () => request<Status>("status"),

  namespaces: () => request<string[]>("namespaces"),
  createNamespace: (name: string) =>
    request<{ namespace: string }>("namespaces", json("POST", { name })),
  dropNamespace: (namespace: string) =>
    request<void>(`namespaces/${seg(namespace)}`, { method: "DELETE" }),

  tables: (namespace: string) =>
    request<string[]>(`namespaces/${seg(namespace)}/tables`),
  createTable: (namespace: string, body: TableIn) =>
    request<TableInfo>(
      `namespaces/${seg(namespace)}/tables`,
      json("POST", body),
    ),
  table: (namespace: string, table: string) =>
    request<TableInfo>(`namespaces/${seg(namespace)}/tables/${seg(table)}`),
  updateTable: (namespace: string, table: string, body: TableUpdateIn) =>
    request<TableInfo>(
      `namespaces/${seg(namespace)}/tables/${seg(table)}`,
      json("PATCH", body),
    ),
  dropTable: (namespace: string, table: string, purge: boolean) =>
    request<void>(
      `namespaces/${seg(namespace)}/tables/${seg(table)}?purge=${purge}`,
      {
        method: "DELETE",
      },
    ),

  rows: (
    namespace: string,
    table: string,
    options: { filter?: string; limit: number },
  ) => {
    const params = new URLSearchParams({ limit: String(options.limit) });
    if (options.filter) params.set("filter", options.filter);
    return request<Rows>(
      `namespaces/${seg(namespace)}/tables/${seg(table)}/rows?${params}`,
    );
  },

  inspectParquet: (file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    return request<Inspect>("parquet/inspect", {
      method: "POST",
      body: form,
      signal,
    });
  },
  uploadParquet: (
    namespace: string,
    table: string,
    file: File,
    mode: "append" | "overwrite",
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    form.append("create", "true");
    return request<Upload>(
      `namespaces/${seg(namespace)}/tables/${seg(table)}/parquet`,
      {
        method: "POST",
        body: form,
        signal,
      },
    );
  },

  query: (sql: string, limit: number, signal?: AbortSignal) =>
    request<Rows>("query", { ...json("POST", { sql, limit }), signal }),
};

export type Catalog = { namespaces: string[]; tables: TableRef[] };

/** Lists every namespace and every table of the catalog, both sorted. Empty namespaces are kept. */
export async function loadCatalog(): Promise<Catalog> {
  const namespaces = await api.namespaces();
  const lists = await Promise.all(
    namespaces.map((namespace) => api.tables(namespace)),
  );
  return {
    namespaces,
    tables: namespaces.flatMap((namespace, i) =>
      lists[i].map((table) => ({ namespace, table })),
    ),
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
