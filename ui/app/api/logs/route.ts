import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const service = params.get("service") ?? "lakekeeper";
  const tail = params.get("tail") ?? "200";
  return Response.json(await nqlake(["logs", "--service", service, "--tail", tail], 25_000));
}
