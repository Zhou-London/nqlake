import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const table = params.get("table");
  if (!table) return Response.json({ ok: false, error: "table is required" }, { status: 400 });
  const offset = params.get("offset") ?? "0";
  const limit = params.get("limit") ?? "200";
  // Each page starts a DuckDB client container; allow for its cold start.
  return Response.json(
    await nqlake(["rows", "--table", table, "--offset", offset, "--limit", limit], 150_000),
  );
}
