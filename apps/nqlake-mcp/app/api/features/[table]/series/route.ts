import { z } from "zod";
import { featureSeries, seriesShape } from "@/lib/features";
import { respond, searchInput, type TableRoute } from "@/lib/http";

export const GET = (request: Request, { params }: TableRoute) =>
  respond(async () => featureSeries(z.object(seriesShape).parse(searchInput(request, (await params).table))));
