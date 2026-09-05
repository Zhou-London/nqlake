import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { table, namespace } = (await request.json()) as { table?: string; namespace?: string };
  if (!table && !namespace) {
    return Response.json({ ok: false, error: "table or namespace is required" }, { status: 400 });
  }
  const args = table ? ["drop", "--table", table] : ["drop", "--namespace", namespace!];
  return Response.json(await nqlake(args, 60_000));
}
