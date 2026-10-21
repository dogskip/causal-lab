import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { expect, it } from "vitest";
const root = resolve(".");
const tsx = createRequire(import.meta.url).resolve("tsx");
const main = resolve("src/cli/main.ts");
function run(args: string[], cwd = root) {
  return spawnSync(
    process.execPath,
    ["--import", tsx, main, ...args],
    { cwd, encoding: "utf8", timeout: 30_000 },
  );
}
it("prints help and the package version", () => {
  const help = run(["--help"]);
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("crdt-fuzz init");
  expect(help.stdout).toContain("crdt-fuzz open");
  expect(help.stdout).toContain("0 passed");
  const version = run(["--version"]);
  expect(version.status, version.stderr).toBe(0);
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
});
it("lists built-in targets and checks in human and JSON form", () => {
  const human = run(["list"]);
  expect(human.status, human.stderr).toBe(0);
  expect(human.stdout).toContain("yjs");
  expect(human.stdout).toContain("or-map");
  expect(human.stdout).toContain("convergence");
  const machine = run(["list", "--json"]);
  expect(machine.status, machine.stderr).toBe(0);
  const parsed = JSON.parse(machine.stdout) as {
    targets: { id: string }[];
    checks: string[];
  };
  expect(parsed.targets.map((target) => target.id)).toEqual(["yjs", "or-map"]);
  expect(parsed.checks).toContain("expected-state");
});
it("initializes a project without overwriting existing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "crdt-fuzz-init-"));
  const first = run(["init", "--target", "yjs"], directory);
  expect(first.status, first.stderr).toBe(0);
  expect(readFileSync(join(directory, "crdt-fuzz.config.mjs"), "utf8")).toContain(
    'target: "yjs"',
  );
  expect(
    readFileSync(join(directory, "adapters/example.mjs"), "utf8"),
  ).toContain("createBuiltinContext");
  const definition = JSON.parse(
    readFileSync(join(directory, "cases/yjs.json"), "utf8"),
  ) as { model_id: string };
  expect(definition.model_id).toBe("yjs-map");
  const second = run(["init"], directory);
  expect(second.status).toBe(2);
  expect(second.stderr).toContain("refusing to overwrite");
  const forced = run(["init", "--force", "--ts"], directory);
  expect(forced.status, forced.stderr).toBe(0);
  expect(
    readFileSync(join(directory, "adapters/example.ts"), "utf8"),
  ).toContain("createBuiltinContext");
  expect(run(["init", "--target", "unknown"], directory).status).toBe(2);
});
it("prints human output by default and one JSON line on request", () => {
  const human = run(["run", "--target", "or-map"]);
  expect(human.status, human.stderr).toBe(0);
  expect(human.stdout).toContain("✓ passed");
  expect(human.stdout.trim().startsWith("{")).toBe(false);
  const machine = run(["run", "--target", "or-map", "--json"]);
  expect(machine.status, machine.stderr).toBe(0);
  expect(machine.stdout.trim().split("\n")).toHaveLength(1);
  const parsed = JSON.parse(machine.stdout) as {
    status: string;
    receipts: { model_id: string }[];
  };
  expect(parsed.status).toBe("passed");
  expect(parsed.receipts[0]?.model_id).toBe("or-map");
});
it("maps --seeds and --time onto generator options", () => {
  const result = run([
    "run",
    "--target",
    "or-map",
    "--seeds",
    "1",
    "--time",
    "5",
    "--json",
  ]);
  expect(result.status, result.stderr).toBe(0);
  const parsed = JSON.parse(result.stdout) as {
    requestedRuns: number;
    actualRuns: number;
  };
  expect(parsed.requestedRuns).toBe(1);
  expect(parsed.actualRuns).toBe(1);
  expect(run(["run", "--target", "or-map", "--time", "soon"]).status).toBe(2);
});
const viewerReady = existsSync(resolve("dist/web/verification.html"));
it.skipIf(!viewerReady)(
  "serves a validated bundle on a loopback viewer without external requests",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "crdt-fuzz-open-"));
    const generated = run([
      "run",
      "--target",
      "or-map",
      "--out",
      directory,
      "--json",
    ]);
    expect(generated.status, generated.stderr).toBe(0);
    const bundle = readdirSync(directory).find((name) =>
      name.endsWith(".bundle.json"),
    )!;
    const runId = JSON.parse(
      readFileSync(join(directory, bundle), "utf8"),
    ) as { run_id: string };
    const child = spawn(
      process.execPath,
      [
        "--import",
        tsx,
        main,
        "open",
        join(directory, bundle),
        "--no-open",
        "--json",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      const line = await new Promise<string>((done, reject) => {
        let output = "";
        const timer = setTimeout(
          () => reject(new Error("viewer did not start")),
          15_000,
        );
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output += chunk;
          const found = output.split("\n")[0];
          if (found !== undefined && found.startsWith("{")) {
            clearTimeout(timer);
            done(found);
          }
        });
        child.once("exit", (code) =>
          reject(new Error("viewer exited with " + String(code))),
        );
      });
      const info = JSON.parse(line) as { url: string; run_id: string };
      expect(info.run_id).toBe(runId.run_id);
      expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//u);
      const html = await fetch(info.url).then((response) => response.text());
      expect(html).toContain('src="./bundle.js"');
      const script = await fetch(new URL("bundle.js", info.url)).then(
        (response) => response.text(),
      );
      expect(script).toContain("__CRDT_FUZZ_BUNDLE__");
      expect(script).toContain(runId.run_id);
      const blocked = await fetch(
        new URL("/%2e%2e%2fpackage.json", info.url),
      );
      expect(blocked.status).toBe(404);
    } finally {
      child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit");
    }
  },
);
it("rejects an open request without a bundle", () => {
  const result = run(["open"]);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("bundle");
});
