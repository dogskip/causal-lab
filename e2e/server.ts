import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mermaidRoot = resolve(
  dirname(require.resolve("mermaid/package.json")),
  "dist",
);
const siteRoot = resolve(process.env.CAUSAL_E2E_DIR ?? "dist/web");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = createServer((request, response) => {
  void (async () => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
      if (pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const diagram = pathname.startsWith("/__mermaid/");
      const base = diagram ? mermaidRoot : siteRoot;
      const suffix = diagram
        ? pathname.slice("/__mermaid/".length)
        : pathname === "/"
          ? "index.html"
          : pathname.slice(1);
      const path = resolve(base, suffix);
      if (!path.startsWith(base + sep)) {
        response.writeHead(403).end();
        return;
      }
      const data = await readFile(path);
      response
        .writeHead(200, {
          "content-type": types[extname(path)] ?? "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(data);
    } catch {
      response.writeHead(404).end();
    }
  })();
});
server.listen(48123, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
  });
