import { spawn } from "node:child_process";
import {
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractError } from "../crdt.js";
import { readBundle } from "../verify/bundle.js";
import { jcs } from "../verify/json.js";

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export type ViewerOptions = Readonly<{
  bundlePath: string;
  root?: string;
  port?: number;
}>;

export type ViewerServer = Readonly<{
  url: string;
  runId: string;
  close: () => Promise<void>;
}>;

function bundleScript(value: unknown): string {
  const json = jcs(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return "globalThis.__CRDT_FUZZ_BUNDLE__ = " + json + ";\n";
}

function send(
  response: ServerResponse,
  status: number,
  body: Buffer,
  type: string,
  head: boolean,
): void {
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(body.byteLength),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(head ? undefined : body);
}

function fail(
  response: ServerResponse,
  status: number,
  message: string,
  head: boolean,
): void {
  send(
    response,
    status,
    Buffer.from(message + "\n"),
    "text/plain; charset=utf-8",
    head,
  );
}

function serveFile(
  response: ServerResponse,
  root: string,
  pathname: string,
  head: boolean,
): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    fail(response, 400, "bad request", head);
    return;
  }
  if (decoded.includes("\0")) {
    fail(response, 400, "bad request", head);
    return;
  }
  const candidate = resolve(root, "." + decoded);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    fail(response, 404, "not found", head);
    return;
  }
  let real: string;
  try {
    real = realpathSync(candidate);
    if (!real.startsWith(prefix) || !statSync(real).isFile()) {
      fail(response, 404, "not found", head);
      return;
    }
  } catch {
    fail(response, 404, "not found", head);
    return;
  }
  const type = TYPES[extname(real).toLowerCase()] ?? "application/octet-stream";
  send(response, 200, readFileSync(real), type, head);
}

export async function startViewerServer(
  options: ViewerOptions,
): Promise<ViewerServer> {
  let raw: string;
  try {
    const stats = statSync(options.bundlePath);
    if (!stats.isFile() || stats.size > MAX_BUNDLE_BYTES)
      throw new ContractError("bundle must be a file no larger than 32 MiB");
    raw = readFileSync(options.bundlePath, "utf8");
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError("bundle file could not be read");
  }
  const bundle = readBundle(raw);
  let root: string;
  try {
    root = realpathSync(
      options.root ?? fileURLToPath(new URL("../../dist/web", import.meta.url)),
    );
  } catch {
    throw new ContractError(
      "viewer assets are missing; run `pnpm build` before `crdt-fuzz open`",
    );
  }
  const viewerPath = join(root, "verification.html");
  let html: string;
  try {
    html = readFileSync(viewerPath, "utf8");
  } catch {
    throw new ContractError(
      "viewer assets are missing; run `pnpm build` before `crdt-fuzz open`",
    );
  }
  if (!html.includes("</head>"))
    throw new ContractError("viewer HTML is missing a head element");
  const injected = html.replace(
    "</head>",
    '<script src="./bundle.js"></script>\n</head>',
  );
  const script = bundleScript(bundle);
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const head = request.method === "HEAD";
      if (request.method !== "GET" && !head) {
        fail(response, 405, "method not allowed", false);
        return;
      }
      let pathname: string;
      try {
        pathname = new URL(
          request.url ?? "/",
          "http://127.0.0.1",
        ).pathname;
      } catch {
        fail(response, 400, "bad request", head);
        return;
      }
      if (pathname === "/") {
        response.writeHead(302, { Location: "/verification.html" });
        response.end();
        return;
      }
      if (pathname === "/verification.html") {
        send(
          response,
          200,
          Buffer.from(injected),
          "text/html; charset=utf-8",
          head,
        );
        return;
      }
      if (pathname === "/bundle.js") {
        send(
          response,
          200,
          Buffer.from(script),
          "text/javascript; charset=utf-8",
          head,
        );
        return;
      }
      serveFile(response, root, pathname, head);
    },
  );
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      done();
    });
  });
  const address = server.address() as AddressInfo;
  const close = (): Promise<void> =>
    new Promise((done, reject) => {
      server.close((error) => (error === undefined ? done() : reject(error)));
      server.closeAllConnections();
    });
  return {
    url: `http://127.0.0.1:${String(address.port)}/verification.html`,
    runId: bundle.run_id,
    close,
  };
}

export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}
