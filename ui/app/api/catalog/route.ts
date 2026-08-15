import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const table = new URL(request.url).searchParams.get("table");
  const args = table ? ["catalog", "--table", table] : ["catalog"];
  return Response.json(await nqlake(args, 25_000));
}
