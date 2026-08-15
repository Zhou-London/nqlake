import { execFile } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(process.cwd(), "..", "scripts", "console", "nqlake.py");

/**
 * Runs a nqlake.py subcommand and resolves with its JSON output. The script
 * reports failures as `{ok: false}` on stdout; this only synthesizes an error
 * object when the process dies without parseable output.
 */
export function nqlake<T = unknown>(args: string[], timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [SCRIPT, "--json", ...args],
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (stdout) {
          try {
            resolve(JSON.parse(stdout) as T);
            return;
          } catch {
            /* fall through */
          }
        }
        resolve({ ok: false, error: error?.message ?? "no output from nqlake.py" } as T);
      },
    );
  });
}
