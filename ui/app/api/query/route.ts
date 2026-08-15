import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { sql } = (await request.json()) as { sql?: string };
  if (!sql?.trim()) {
    return Response.json({ ok: false, error: "empty statement" }, { status: 400 });
  }
  // The DuckDB client container spins up per query; allow for image cold start.
  return Response.json(await nqlake(["query", "--sql", sql], 150_000));
}
