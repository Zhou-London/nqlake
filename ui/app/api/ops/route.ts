import { nqlake } from "@/lib/nqlake";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["start", "stop", "restart", "stack-up", "stack-stop", "smoke"]);

export async function POST(request: Request) {
  const { action, service } = (await request.json()) as {
    action?: string;
    service?: string;
  };
  if (!action || !ACTIONS.has(action)) {
    return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
  }
  const args = ["ops", "--action", action];
  if (service) args.push("--service", service);
  return Response.json(await nqlake(args, 330_000));
}
