import { execFile } from "node:child_process";
import path from "node:path";

/** The stack root: the console runs from ui/, one level below it. */
export const ROOT = path.resolve(process.cwd(), "..");
const SCRIPT = path.join(ROOT, "backend", "nqlake.py");

/**
 * Runs a nqlake.py subcommand and resolves with its JSON output. The script
 * reports failures as `{ok: false}` on stdout; this only synthesizes an error
 * object when the process dies without parseable output.
 *
 * The interpreter is the stack's uv environment (pyproject.toml, uv.lock),
 * which `make up` creates; --frozen keeps uv from touching the lock.
 */
export function nqlake<T = unknown>(args: string[], timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve) => {
    execFile(
      "uv",
      ["run", "--frozen", "--quiet", "--project", ROOT, "python", SCRIPT, "--json", ...args],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
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
