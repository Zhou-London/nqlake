import { z } from "zod";
import { respond, searchInput } from "@/lib/http";
import { closesShape, recentCloses } from "@/lib/ohlcv";

export const GET = (request: Request) => respond(async () => recentCloses(z.object(closesShape).parse(searchInput(request))));
