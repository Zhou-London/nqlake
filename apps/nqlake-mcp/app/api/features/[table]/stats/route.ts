import { z } from "zod";
import { featureStats, statsShape } from "@/lib/features";
import { respond, searchInput, type TableRoute } from "@/lib/http";

export const GET = (request: Request, { params }: TableRoute) =>
  respond(async () => featureStats(z.object(statsShape).parse(searchInput(request, (await params).table))));
