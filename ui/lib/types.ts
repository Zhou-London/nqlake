export interface Component {
  state: string;
  health: string | null;
  status: string | null;
  exitCode?: number;
  oneshot: boolean;
  api?: boolean;
  version?: string;
  bootstrapped?: boolean;
}

export interface StatusPayload {
  ok: boolean;
  error?: string;
  components: Record<string, Component>;
  links: {
    "lakekeeper-postgres": { ok: boolean };
    "lakekeeper-minio": { ok: boolean; warehouse?: string };
    "duckdb-stack": { ok: boolean; at?: number; detail?: string };
  };
  server?: { version: string; bootstrapped: boolean; "authz-backend": string } | null;
  warehouse?: { name: string; status: string; "storage-profile": { bucket: string } } | null;
}

export interface ContainerStats {
  cpuPercent: number;
  memBytes: number;
  memLimitBytes: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface DirStats {
  bytes: number;
  files: number;
  parquetBytes: number;
  parquetFiles: number;
}

export interface StatsPayload {
  ok: boolean;
  error?: string;
  containers: Record<string, ContainerStats>;
  storage: { bucket: DirStats & { name: string }; postgres: DirStats; duckdb: DirStats };
  tableCount: number | null;
  warehouseStats: { timestamp: string; tables: number; views: number }[] | null;
  apiSeries: { timestamp: string; calls: number; errors: number }[];
  apiRoutes: { route: string; count: number }[];
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
  currentSnapshot: {
    id: number;
    timestampMs: number;
    summary: Record<string, string>;
  } | null;
}

export interface QueryPayload {
  ok: boolean;
  error?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
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
