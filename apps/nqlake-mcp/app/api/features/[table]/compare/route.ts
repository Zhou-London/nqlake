import { z } from "zod";
import { compareShape, compareSymbols } from "@/lib/features";
import { respond, searchInput, type TableRoute } from "@/lib/http";

export const GET = (request: Request, { params }: TableRoute) =>
  respond(async () => compareSymbols(z.object(compareShape).parse(searchInput(request, (await params).table))));
