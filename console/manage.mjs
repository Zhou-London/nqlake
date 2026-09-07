import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = fileURLToPath(new URL("./", import.meta.url));
const state = `${root}images/console/state`;
const pidFile = `${state}/console.pid`;
const logFile = `${state}/console.log`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
let pid;
try {
  pid = Number(readFileSync(pidFile, "utf8"));
} catch {}
if (process.argv[2] === "stop") {
  if (pid && alive(pid)) {
    process.kill(-pid, "SIGTERM");
    for (let i = 0; i < 100 && alive(pid); i++) await wait(100);
    if (alive(pid)) throw new Error(`Console did not stop. Check ${logFile}.`);
  }
  try {
    unlinkSync(pidFile);
  } catch {}
  console.log("console: stopped");
} else {
  loadEnvFile(`${root}.env`);
  const port = process.env.CONSOLE_PORT;
  if (!port || !/^\d+$/.test(port) || +port < 1 || +port > 65535)
    throw new Error("Set CONSOLE_PORT in .env (1–65535).");
  if (pid && alive(pid)) {
    console.log(`console: already running on http://localhost:${port}`);
    process.exit(0);
  }
  for (const args of [["ci"], ["run", "build"]]) {
    const result = spawnSync("npm", args, { cwd: directory, stdio: "inherit" });
    if (result.error || result.status !== 0) process.exit(result.status || 1);
  }
  mkdirSync(state, { recursive: true });
  const log = openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", port, "-H", "127.0.0.1"],
    { cwd: directory, detached: true, stdio: ["ignore", log, log] },
  );
  closeSync(log);
  writeFileSync(pidFile, String(child.pid));
  child.unref();
  for (let i = 0; i < 100 && alive(child.pid); i++) {
    await wait(300);
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && alive(child.pid)) {
        console.log(
          `console: started on http://localhost:${port}; log: ${logFile}`,
        );
        process.exit(0);
      }
    } catch {}
  }
  if (alive(child.pid)) process.kill(-child.pid, "SIGTERM");
  unlinkSync(pidFile);
  throw new Error(`Console failed to start. Check ${logFile}.`);
}
