import { respond } from "@/lib/http";
import { marketSymbols } from "@/lib/ohlcv";

export const GET = () => respond(marketSymbols);
