import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { config } from "@/lib/config";
import { featureServer } from "@/lib/mcp";

const BEARER = "Bearer ";

function writeAccess(request: Request) {
  if (!config.writeToken)
    return { canWrite: false, writeRefusal: "Writing is off: the server has no NQLAKE_MCP_WRITE_TOKEN" };
  const header = request.headers.get("authorization") ?? "";
  const presented = Buffer.from(header.startsWith(BEARER) ? header.slice(BEARER.length) : "");
  const expected = Buffer.from(config.writeToken);
  const matches = presented.length === expected.length && timingSafeEqual(presented, expected);
  return { canWrite: matches, writeRefusal: "Writing needs the header Authorization: Bearer <NQLAKE_MCP_WRITE_TOKEN>" };
}

export async function POST(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await featureServer(writeAccess(request)).connect(transport);
  return transport.handleRequest(request);
}

const sessionless = () => new Response(null, { status: 405, headers: { Allow: "POST" } });

export const GET = sessionless;
export const DELETE = sessionless;
