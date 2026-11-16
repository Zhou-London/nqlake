import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { config } from "./config";

export const CATALOG = "lake";

const store = globalThis as typeof globalThis & { nqlakeInstance?: Promise<DuckDBInstance> };

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

export const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function attachLake(): Promise<DuckDBInstance> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await connection.run("SET GLOBAL TimeZone = 'UTC'");
    await connection.run(
      `CREATE SECRET (TYPE iceberg, URI ${literal(config.catalogUri)}, ` +
        `CLIENT_ID ${literal(config.accessKey)}, CLIENT_SECRET ${literal(config.secretKey)})`,
    );
    await connection.run(
      `ATTACH ${literal(config.warehouse)} AS ${CATALOG} (TYPE iceberg, URI ${literal(config.catalogUri)})`,
    );
    return instance;
  } finally {
    connection.closeSync();
  }
}

export async function query<Row>(sql: string, values: Record<string, DuckDBValue> = {}): Promise<Row[]> {
  store.nqlakeInstance ??= attachLake();
  const instance = await store.nqlakeInstance.catch((error) => {
    store.nqlakeInstance = undefined;
    throw error;
  });
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll(sql, values);
    return reader.getRowObjectsJson() as Row[];
  } finally {
    connection.closeSync();
  }
}
