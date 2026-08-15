import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await nqlake(["stats"], 30_000));
}
