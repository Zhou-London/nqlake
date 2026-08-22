import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await nqlake(["ports"], 25_000));
}

export async function POST(request: Request) {
  const { ports } = (await request.json()) as {
    ports?: Record<string, string | number>;
  };
  const entries = Object.entries(ports ?? {});
  if (!entries.length) {
    return Response.json({ ok: false, error: "no ports given" }, { status: 400 });
  }
  const args = ["ports"];
  for (const [key, value] of entries) args.push("--set", `${key}=${value}`);
  return Response.json(await nqlake(args, 25_000));
}
