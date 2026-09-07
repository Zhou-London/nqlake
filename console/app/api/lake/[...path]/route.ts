import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/data.mjs";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !path.length ||
    !["status", "namespaces", "query", "parquet"].includes(path[0]) ||
    path.some((part) => part === "." || part === "..")
  ) {
    return Response.json({ error: "Unknown API route" }, { status: 404 });
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      !isSameOrigin(
        origin,
        request.headers.get("host"),
        request.nextUrl.protocol,
      )
    )
      return Response.json(
        { error: "Cross-origin writes are not allowed." },
        { status: 403 },
      );
  }
  const port = process.env.API_PORT || "40004";
  const url = `http://127.0.0.1:${port}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      cache: "no-store",
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    } as RequestInit & { duplex: string });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Cannot connect to the data service. Start the backend and try again.",
      },
      { status: 502 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
