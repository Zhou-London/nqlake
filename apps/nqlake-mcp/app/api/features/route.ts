import { listFeatureTables } from "@/lib/features";
import { respond } from "@/lib/http";

export const GET = () => respond(listFeatureTables);
