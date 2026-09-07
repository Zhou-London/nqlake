// Server-side bridge to the Python backend. Runs only inside route handlers.

import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

// next.config.mjs loads ../.env into the build; the running server reads the
// same file again so `make up` after a port change needs no rebuild. Both
// `next dev` and `next start` run from console/, so the path is relative to
// the working directory rather than to this file, which is bundled elsewhere.
try {
  loadEnvFile(resolve(process.cwd(), "../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export const API_PORT = process.env.API_PORT ?? "40004";
export const UPSTREAM = `http://127.0.0.1:${API_PORT}`;

/**
 * Parses JSON keeping integers wider than 2^53 as digit strings. Snapshot
 * ids are 63-bit; `JSON.parse` alone would round them.
 */
export function parseBigSafe(text: string): unknown {
  return JSON.parse(
    text,
    function (_key, value, context?: { source?: string }) {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        !Number.isSafeInteger(value)
      ) {
        const source = context?.source;
        if (source && /^-?\d+$/.test(source)) return source;
      }
      return value;
    },
  );
}
