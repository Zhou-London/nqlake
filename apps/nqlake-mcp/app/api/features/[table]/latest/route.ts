import { z } from "zod";
import { barsShape, latestFeatures } from "@/lib/features";
import { respond, searchInput, type TableRoute } from "@/lib/http";

export const GET = (request: Request, { params }: TableRoute) =>
  respond(async () => latestFeatures(z.object(barsShape).parse(searchInput(request, (await params).table))));
