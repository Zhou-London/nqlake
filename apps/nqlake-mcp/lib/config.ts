import { homedir } from "node:os";
import { join } from "node:path";

const setting = (name: string, fallback: string) => process.env[name] || fallback;

export const config = {
  catalogUri: setting("NQLAKE_CATALOG_URI", "http://localhost:8181"),
  warehouse: setting("NQLAKE_WAREHOUSE", "warehouse"),
  accessKey: setting("NQLAKE_S3_ACCESS_KEY", "nqlake"),
  secretKey: setting("NQLAKE_S3_SECRET_KEY", "nqlake-dev-secret"),
  suggestionsDb: setting("NQLAKE_MCP_DB", join(homedir(), ".nqlake", "suggestions.db")),
  writeToken: process.env.NQLAKE_MCP_WRITE_TOKEN || null,
};
