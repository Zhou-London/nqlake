import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { settings } from "./server.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
const state = path.resolve(root, "../images/console/state");
const pidFile = path.join(state, "console.pid");
const command = process.argv[2];
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const pid = fs.existsSync(pidFile)
  ? Number(fs.readFileSync(pidFile, "utf8"))
  : 0;
if (command === "stop") {
  if (pid && alive(pid)) process.kill(pid, "SIGTERM");
  fs.rmSync(pidFile, { force: true });
  console.log("console: stopped");
} else if (command === "start") {
  if (pid && alive(pid)) {
    console.log(
      `console: already running on http://localhost:${settings().port}`,
    );
    process.exit(0);
  }
  for (const args of [
    ["ci", "--no-audit", "--no-fund"],
    ["run", "build"],
  ]) {
    const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  fs.mkdirSync(state, { recursive: true });
  const log = fs.openSync(path.join(state, "console.log"), "a");
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
  });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  fs.closeSync(log);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (!alive(child.pid)) break;
    try {
      const response = await fetch(`http://127.0.0.1:${settings().port}`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) {
    console.error(
      "console: failed to start; see images/console/state/console.log",
    );
    process.exit(1);
  }
  console.log(`console: started on http://localhost:${settings().port}`);
} else {
  console.error("Usage: node console/manage.mjs start|stop");
  process.exitCode = 1;
}
