import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The playground renders scenario values, which are arbitrary text up to 4 KiB.
 * These checks hold the defence in place: text-only rendering, no network, no
 * external resource, and a meta CSP that survives the build.
 */

const WEB_DIR = new URL("../web/", import.meta.url);
const DIST_DIR = new URL("../dist/web/", import.meta.url);
const TEXT_FILE = /\.(ts|css|html|js)$/u;

function readTree(root: URL): string {
  if (!existsSync(root)) {
    return "";
  }
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => TEXT_FILE.test(file))
    .map((file) => readFileSync(new URL(file, root), "utf8"))
    .join("\n");
}

const sources = readTree(WEB_DIR);
const built = readTree(DIST_DIR);

describe("playground security policy", () => {
  it("is checked against a build", () => {
    expect(existsSync(new URL("index.html", DIST_DIR)), "run `pnpm build` before `pnpm test`").toBe(true);
  });

  it("uses no HTML injection sink or dynamic code execution", () => {
    for (const [name, text] of [
      ["web/", sources],
      ["dist/web/", built],
    ]) {
      expect(text, name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/u);
      expect(text, name).not.toMatch(/\beval\(|new Function\(/u);
    }
  });

  it("makes no network call", () => {
    for (const [name, text] of [
      ["web/", sources],
      ["dist/web/", built],
    ]) {
      expect(text, name).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/u);
    }
  });

  it("loads no external resource", () => {
    for (const [name, text] of [
      ["web/", sources],
      ["dist/web/", built],
    ]) {
      expect(text, name).not.toMatch(/https?:\/\//u);
    }
  });

  it("declares the CSP in the page and in the build", () => {
    for (const [name, text] of [
      ["web/index.html", readFileSync(new URL("index.html", WEB_DIR), "utf8")],
      ["dist/web/index.html", readFileSync(new URL("index.html", DIST_DIR), "utf8")],
    ]) {
      expect(text, name).toMatch(/http-equiv="Content-Security-Policy"/u);
      expect(text, name).toContain("default-src 'none'");
      expect(text, name).toContain("script-src 'self'");
      expect(text, name).toContain("connect-src 'none'");
      expect(text, name).toContain("object-src 'none'");
    }
  });
});
