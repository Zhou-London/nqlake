// Shapes of the backend API, mirrored from backend/nqlake/api/schemas.py.
// Integers above 2^53 (snapshot ids, big counts) arrive as strings: the
// console's /api proxy keeps their digits instead of rounding them.

export type ApiErrorBody = { error: string; problems: string[] };

export type ServiceStatus = {
  name: string;
  ok: boolean;
  detail: string;
  port: number | null;
};

export type Status = {
  ok: boolean;
  warehouse: string;
  services: ServiceStatus[];
};

export type Column = {
  id: number;
  name: string;
  type: string;
  required: boolean;
  doc: string | null;
};

export type TableInfo = {
  namespace: string;
  name: string;
  format_version: number;
  location: string;
  columns: Column[];
  partition_by: string[];
  properties: Record<string, string>;
  snapshot_id: string | number | null;
  snapshot_at: string | null;
  row_count: number | null;
  snapshot_count: number;
};

export type ColumnIn = {
  name: string;
  type: string;
  required: boolean;
  doc?: string | null;
};

export type TableIn = {
  name: string;
  columns: ColumnIn[];
  partition_by: string[];
  properties: Record<string, string>;
};

export type TableUpdateIn = {
  rename_to?: string | null;
  set_properties?: Record<string, string>;
  remove_properties?: string[];
  add_columns?: ColumnIn[];
};

export type Cell =
  string | number | boolean | null | Cell[] | { [key: string]: Cell };

export type Rows = {
  columns: string[];
  rows: Record<string, Cell>[];
  row_count: number;
};

export type Repair = {
  column: string;
  from_type: string;
  to_type: string;
  reason: string;
  lossy: boolean;
};

export type ColumnReport = {
  name: string;
  parquet_type: string;
  iceberg_type: string;
};

export type Inspect = {
  rows: number;
  columns: ColumnReport[];
  repairs: Repair[];
};

export type Upload = {
  namespace: string;
  table: string;
  created: boolean;
  mode: "append" | "overwrite";
  rows: number;
  snapshot_id: string | number | null;
  repairs: Repair[];
};

export type TableRef = { namespace: string; table: string };
