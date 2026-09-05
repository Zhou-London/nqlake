import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { sql } = (await request.json()) as { sql?: string };
  if (!sql?.trim()) {
    return Response.json({ ok: false, error: "empty statement" }, { status: 400 });
  }
  // Bounded by the data DuckDB scans and returns, not by a cold start.
  return Response.json(await nqlake(["query", "--sql", sql], 150_000));
}
