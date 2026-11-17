import { z } from "zod";
import { InputError } from "./features";

export async function respond(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (error) {
    if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof z.ZodError) return Response.json({ error: z.prettifyError(error) }, { status: 400 });
    console.error(error);
    return Response.json({ error: "The lake is unavailable" }, { status: 502 });
  }
}

export function searchInput(request: Request, table?: string): Record<string, unknown> {
  const { features, symbols, ...search } = Object.fromEntries(new URL(request.url).searchParams);
  return {
    ...search,
    ...(table ? { table } : {}),
    ...(features ? { features: features.split(",") } : {}),
    ...(symbols ? { symbols: symbols.split(",") } : {}),
  };
}

export type TableRoute = { params: Promise<{ table: string }> };
