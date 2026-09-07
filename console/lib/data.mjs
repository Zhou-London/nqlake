/** Preserve Iceberg snapshot IDs and 64-bit values as decimal strings. */
export function parseLakeJson(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      !Number.isSafeInteger(value) &&
      context?.source
    )
      return context.source;
    return value;
  });
}

export function displayCell(value) {
  return value == null
    ? "NULL"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}

/** Quote CSV fields and prevent spreadsheet applications from executing formulas. */
export function toCsv(columns, rows) {
  const escape = (value) => {
    let text = value == null ? "" : displayCell(value);
    if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}

/** Match the browser Origin against Host; Next may normalize the internal URL to localhost. */
export function isSameOrigin(origin, host, protocol) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === host && url.protocol === protocol;
  } catch {
    return false;
  }
}
