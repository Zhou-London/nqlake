import { z } from "zod";
import { respond, searchInput } from "@/lib/http";
import { readShape, readSuggestions } from "@/lib/suggestions";

export const GET = (request: Request) => respond(async () => readSuggestions(z.object(readShape).parse(searchInput(request))));
