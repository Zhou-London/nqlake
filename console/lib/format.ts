import type { Cell } from "./types.ts";

const compact = new Intl.NumberFormat("en-US");

export function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "number" ? compact.format(value) : value;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Renders one cell for a grid: nested values as JSON, null as a marker. */
export function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Splits `ns.table` at the last dot; a bare name has no namespace. */
export function splitQualified(name: string): {
  namespace: string;
  table: string;
} {
  const i = name.lastIndexOf(".");
  return i < 0
    ? { namespace: "", table: name }
    : { namespace: name.slice(0, i), table: name.slice(i + 1) };
}

/** A DuckDB identifier, quoted when it is not a plain word. */
export function sqlIdent(name: string): string {
  return /^[a-z_][a-z0-9_]*$/i.test(name)
    ? name
    : `"${name.replaceAll('"', '""')}"`;
}

export function sqlPath(namespace: string, table: string): string {
  return ["lake", ...namespace.split("."), table].map(sqlIdent).join(".");
}
