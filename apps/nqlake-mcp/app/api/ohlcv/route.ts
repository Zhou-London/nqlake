import { z } from "zod";
import { respond, searchInput } from "@/lib/http";
import { candlesShape, ohlcvBars } from "@/lib/ohlcv";

export const GET = (request: Request) => respond(async () => ohlcvBars(z.object(candlesShape).parse(searchInput(request))));
