import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { ROOT, nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

/** Upload scratch; `load` reads the file from here in place. */
const WORK_DIR = path.join(ROOT, "images", "duckdb", "work");

/**
 * Streams the request body to the work directory and loads it into the table
 * named by `?table=ns.name`. The body is the file itself (not multipart), so
 * a large Parquet file is written to disk as it arrives rather than buffered.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const table = params.get("table") ?? "";
  const name = path.basename(params.get("name") ?? "").replace(/[^\w.-]/g, "_");
  if (!table || !name || !request.body) {
    return Response.json({ ok: false, error: "table, name, and a file body are required" }, { status: 400 });
  }

  await mkdir(WORK_DIR, { recursive: true });
  const dest = path.join(WORK_DIR, `.upload-${crypto.randomUUID().slice(0, 8)}-${name}`);
  try {
    await pipeline(Readable.fromWeb(request.body as NodeReadableStream), createWriteStream(dest));
    const args = ["load", "--file", dest, "--table", table];
    if (params.get("replace") === "1") args.push("--replace");
    return Response.json(await nqlake(args, 330_000));
  } finally {
    await unlink(dest).catch(() => {});
  }
}
