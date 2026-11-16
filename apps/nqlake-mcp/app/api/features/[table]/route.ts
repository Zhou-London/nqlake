import { describeFeatureTable } from "@/lib/features";
import { respond, type TableRoute } from "@/lib/http";

export const GET = (_request: Request, { params }: TableRoute) =>
  respond(async () => describeFeatureTable((await params).table));
