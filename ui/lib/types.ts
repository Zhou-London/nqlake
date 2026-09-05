/** Payload shapes returned by backend/nqlake.py --json. */

export interface Component {
  state: string;
  health: string | null;
  status: string | null;
  exitCode: number | null;
  oneshot: boolean;
}

export interface StatusPayload {
  ok: boolean;
  error?: string;
  components: Record<string, Component>;
  catalog: { reachable: boolean; version: string | null; bootstrapped: boolean | null; dbOk: boolean };
  warehouse: { name: string; status: string } | null;
}

export interface ContainerStats {
  cpuPercent: number;
  memBytes: number;
  memLimitBytes: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface StatsPayload {
  ok: boolean;
  error?: string;
  containers: Record<string, ContainerStats>;
  storage: { bucket: number; postgres: number; duckdb: number };
}

export interface CatalogPayload {
  ok: boolean;
  error?: string;
  namespaces: { name: string; tables: string[] }[];
}

export interface TableDetail {
  namespace: string;
  name: string;
  location: string;
  formatVersion: number;
  lastUpdatedMs: number;
  fields: { id: number; name: string; type: string; required: boolean }[];
  snapshotCount: number;
  currentSnapshot: { id: number; timestampMs: number; summary: Record<string, string> } | null;
}

export interface RowsPayload {
  ok: boolean;
  error?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  elapsedMs?: number;
  offset?: number;
}

export interface LoadPayload {
  ok: boolean;
  error?: string;
  table?: string;
  mode?: "create" | "append" | "replace";
  tableRows?: number | null;
  /** Columns cast on create because Iceberg has no such type (e.g. UTINYINT → INTEGER). */
  widened?: { column: string; from: string; to: string }[];
  elapsedMs?: number;
}

export interface OpsPayload {
  ok: boolean;
  error?: string;
  action?: string;
  service?: string | null;
  detail?: string | null;
  elapsedMs?: number;
}

export interface LogsPayload {
  ok: boolean;
  error?: string;
  service?: string;
  lines?: string[];
}

export interface PortEntry {
  key: string;
  service: string;
  label: string;
  description: string;
  applies: "stack" | "console";
  url: string | null;
  value: number | null;
  error?: string;
  /** Host ports the service publishes right now; null when it is not running. */
  live: number[] | null;
  running: boolean;
  /** The service runs on ports other than the ones .env now asks for. */
  pending: boolean;
  inUse: boolean;
}

export interface PortsPayload {
  ok: boolean;
  error?: string;
  ports: PortEntry[];
  changed?: {
    key: string;
    /** null when .env did not carry the variable yet. */
    from: number | null;
    to: number;
    applies: "stack" | "console";
  }[];
  restart?: ("stack" | "console")[];
}
