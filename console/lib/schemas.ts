// Form schemas of every dialog, validated with zod before a request leaves.

import { z } from "zod";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const identifier = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(NAME, "Letters, digits, and underscores; must not start with a digit");

export const namespaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => v.split(".").every((level) => NAME.test(level)), {
      message: "Dot-separated levels, each of letters, digits, and underscores",
    }),
});
export type NamespaceForm = z.infer<typeof namespaceSchema>;

export const ICEBERG_TYPES = [
  "boolean",
  "int",
  "long",
  "float",
  "double",
  "decimal(38,9)",
  "date",
  "time",
  "timestamp",
  "timestamptz",
  "string",
  "uuid",
  "binary",
] as const;

const TYPE =
  /^(boolean|int|long|float|double|date|time|timestamp|timestamptz|timestamp_ns|timestamptz_ns|string|uuid|binary|fixed\[\d+\]|decimal\(\s*\d+\s*,\s*\d+\s*\))$/;

export const columnSchema = z.object({
  name: identifier,
  type: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(TYPE, "Not an Iceberg primitive type"),
  required: z.boolean(),
  doc: z.string().trim().optional(),
});
export type ColumnForm = z.infer<typeof columnSchema>;

/** `symbol`, `day(ts)`, or `bucket[16](id)`. */
const PARTITION = /^(?:\w+(?:\[\d+\])?\(\w+\)|\w+)$/;

export const propertiesJson = z
  .string()
  .trim()
  .refine(
    (text) => {
      if (!text) return true;
      try {
        const value = JSON.parse(text);
        return (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.values(value).every((v) => typeof v === "string")
        );
      } catch {
        return false;
      }
    },
    { message: 'A JSON object of string values, such as {"owner": "desk"}' },
  );

export function parseProperties(text: string): Record<string, string> {
  return text.trim() ? (JSON.parse(text) as Record<string, string>) : {};
}

export const createTableSchema = z
  .object({
    namespace: z.string().min(1, "Choose a namespace"),
    name: identifier,
    columns: z.array(columnSchema).min(1, "Add at least one column"),
    partition_by: z
      .string()
      .trim()
      .refine(
        (v) => !v || v.split(",").every((e) => PARTITION.test(e.trim())),
        {
          message:
            "Entries such as symbol, day(ts), or bucket[16](id), separated by commas",
        },
      ),
    properties: propertiesJson,
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.columns.forEach((column, i) => {
      if (seen.has(column.name))
        ctx.addIssue({
          code: "custom",
          path: ["columns", i, "name"],
          message: "Duplicate name",
        });
      seen.add(column.name);
    });
  });
export type CreateTableForm = z.infer<typeof createTableSchema>;

export const manageTableSchema = z.object({
  rename_to: z
    .string()
    .trim()
    .refine((v) => !v || NAME.test(v), {
      message: "Letters, digits, and underscores; must not start with a digit",
    }),
  add_columns: z.array(columnSchema),
  properties: propertiesJson,
});
export type ManageTableForm = z.infer<typeof manageTableSchema>;

export const previewSchema = z.object({
  filter: z.string().trim(),
  limit: z
    .number({ error: "Enter a number" })
    .int()
    .min(1, "At least 1")
    .max(10_000, "At most 10,000"),
});
export type PreviewForm = z.infer<typeof previewSchema>;

export const querySchema = z.object({
  sql: z.string().trim().min(1, "Enter a statement"),
  limit: z
    .number({ error: "Enter a number" })
    .int()
    .min(100, "At least 100")
    .max(10_000, "At most 10,000"),
});
export type QueryForm = z.infer<typeof querySchema>;

export const importSchema = z
  .object({
    namespace: z.string().min(1, "Choose a namespace"),
    table: identifier,
    mode: z.enum(["append", "overwrite"]),
    confirmTable: z.string(),
    acknowledgeLossy: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "overwrite" && value.confirmTable !== value.table)
      ctx.addIssue({
        code: "custom",
        path: ["confirmTable"],
        message: "Type the table name to replace all rows",
      });
  });
export type ImportForm = z.infer<typeof importSchema>;

export const confirmNameSchema = (expected: string) =>
  z.object({
    name: z.string().refine((v) => v === expected, {
      message: `Type ${expected} to confirm`,
    }),
    purge: z.boolean(),
  });
