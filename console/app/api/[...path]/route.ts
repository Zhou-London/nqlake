// Forwards the console's /api calls to the Python backend on loopback.
//
// Only the routes the console uses are forwarded; everything else answers
// 404 here, so the row-editing endpoints of the backend stay off the network.
// JSON answers are rewritten once so big integers keep their digits.

import type { NextRequest } from "next/server";
import { parseBigSafe, UPSTREAM } from "@/lib/upstream";

const NS = "[^/]+";
const TABLE = `namespaces/${NS}/tables/${NS}`;

const ALLOW: { methods: string[]; path: RegExp }[] = [
  { methods: ["GET"], path: /^status$/ },
  { methods: ["GET", "POST"], path: /^namespaces$/ },
  { methods: ["DELETE"], path: new RegExp(`^namespaces/${NS}$`) },
  { methods: ["GET", "POST"], path: new RegExp(`^namespaces/${NS}/tables$`) },
  { methods: ["GET", "PATCH", "DELETE"], path: new RegExp(`^${TABLE}$`) },
  { methods: ["GET"], path: new RegExp(`^${TABLE}/rows$`) },
  { methods: ["POST"], path: new RegExp(`^${TABLE}/parquet$`) },
  { methods: ["POST"], path: /^parquet\/inspect$/ },
  { methods: ["POST"], path: /^query$/ },
];

// Uploads stream a whole Parquet file through and then wait for the write.
const TIMEOUT_MS = 10 * 60 * 1000;

function error(status: number, message: string) {
  return Response.json({ error: message, problems: [] }, { status });
}

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, ctx: Context) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const rule = ALLOW.find((r) => r.path.test(joined));
  if (!rule) return error(404, `The console has no route for /api/${joined}.`);
  if (!rule.methods.includes(request.method))
    return error(405, `${request.method} is not allowed on /api/${joined}.`);

  const url = new URL(`${UPSTREAM}/${joined}`);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");

  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Streams the request body instead of buffering the whole upload.
      ...(hasBody ? { duplex: "half" } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    } as RequestInit);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return error(
      timedOut ? 504 : 503,
      timedOut
        ? "The API did not answer within ten minutes. Check the table before retrying: the write may have completed."
        : `The API at ${UPSTREAM} did not answer: ${reason}. Start it with \`make api-start\`.`,
    );
  }

  if (upstream.status === 204) return new Response(null, { status: 204 });
  const type = upstream.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const text = await upstream.text();
    try {
      return Response.json(parseBigSafe(text), { status: upstream.status });
    } catch {
      return new Response(text, {
        status: upstream.status,
        headers: { "content-type": type },
      });
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": type || "application/octet-stream" },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
