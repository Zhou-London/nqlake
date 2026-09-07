import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export function settings() {
  let env = {};
  try {
    env = Object.fromEntries(
      fs
        .readFileSync(path.join(root, "../.env"), "utf8")
        .split("\n")
        .filter((line) => /^\s*[A-Z_]+=/.test(line))
        .map((line) => {
          const i = line.indexOf("=");
          return [
            line.slice(0, i).trim(),
            line
              .slice(i + 1)
              .trim()
              .replace(/^['"]|['"]$/g, ""),
          ];
        }),
    );
  } catch {}
  return {
    port: Number(process.env.CONSOLE_PORT || env.CONSOLE_PORT || 40001),
    apiPort: Number(process.env.API_PORT || env.API_PORT || 40004),
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { port, apiPort } = settings();
  const dev = process.argv.includes("--dev");
  const vite = dev
    ? await (
        await import("vite")
      ).createServer({ root, server: { middlewareMode: true }, appType: "spa" })
    : null;
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".ico": "image/x-icon",
  };
  const server = http.createServer((req, res) => {
    if (req.url === "/api" || req.url.startsWith("/api/")) {
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: apiPort,
          path: req.url.slice(4) || "/",
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
        },
        (incoming) => {
          res.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "The backend is unavailable. Start the API and try again.",
            }),
          );
        } else res.destroy();
      });
      req.on("aborted", () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    if (vite) return vite.middlewares(req, res);
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const dist = path.join(root, "dist");
    let file = path.resolve(dist, "." + pathname);
    if (!file.startsWith(dist + path.sep) && file !== dist) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      file = path.join(dist, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(503);
      res.end("Build the console with npm run build first.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`NQ Lake console: http://localhost:${port}`),
  );
}
