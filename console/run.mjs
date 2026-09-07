import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const port = process.env.CONSOLE_PORT;
if (!port || !/^\d+$/.test(port) || +port < 1 || +port > 65535)
  throw new Error("Set CONSOLE_PORT in the root .env (1–65535).");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    process.argv[2] || "dev",
    "-p",
    port,
    "-H",
    "127.0.0.1",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
