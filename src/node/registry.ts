import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrMapAdapter } from "../adapters/or-map.js";
import { createYjsAdapter } from "../adapters/yjs.js";
import { ContractError } from "../crdt.js";
import { parseVerificationCase } from "../verify/case.js";
import { createInvariantSet } from "../verify/checks.js";
import { jcs } from "../verify/json.js";
import type {
  EngineIdentity,
  Manifest,
  VerifierOptions,
} from "../verify/types.js";

const require = createRequire(import.meta.url);
const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
const codeRoot = fileURLToPath(new URL("../", import.meta.url));
const digest = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
const fileDigest = (path: string | URL): string => digest(readFileSync(path));
function treeDigest(path: string): string {
  const files: [string, string][] = [];
  const visit = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.isSymbolicLink()) continue;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (
        !entry.name.endsWith(".d.ts") &&
        /\.(?:ts|js|mjs|cjs|json)$/.test(entry.name)
      )
        files.push([
          relative(path, full).replaceAll("\\", "/"),
          fileDigest(full),
        ]);
    }
  };
  visit(path);
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return digest(new TextEncoder().encode(jcs(files)));
}

export function createBuiltinContext(input: unknown): VerifierOptions<unknown> {
  const definition = parseVerificationCase(input);
  if (definition.model_id !== "or-map" && definition.model_id !== "yjs-map")
    throw new ContractError(
      "model is not registered; supply a trusted module explicitly",
    );
  const packageInfo = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const engine = createEngineIdentity();
  let implementation = {
    name: "causal-lab-or-map",
    version: packageInfo.version,
    integrity:
      "sha256:" + fileDigest(new URL("../crdt" + extension, import.meta.url)),
  };
  if (definition.model_id === "yjs-map") {
    const infoPath = require.resolve("yjs/package.json");
    const info = JSON.parse(readFileSync(infoPath, "utf8")) as {
      version: string;
    };
    const lib0Path = createRequire(infoPath).resolve("lib0/package.json");
    const isomorphicPath = createRequire(lib0Path).resolve(
      "isomorphic.js/package.json",
    );
    const packages = [
      ["yjs", treeDigest(dirname(infoPath))],
      ["lib0", treeDigest(dirname(lib0Path))],
      ["isomorphic.js", treeDigest(dirname(isomorphicPath))],
    ];
    implementation = {
      name: "yjs",
      version: info.version,
      integrity: "sha256:" + digest(new TextEncoder().encode(jcs(packages))),
    };
  }
  const manifest: Manifest = Object.freeze({
    adapterApi: "causal-lab-adapter-v2",
    model_id: definition.model_id,
    adapterId: definition.model_id,
    adapterVersion: "1",
    adapterSha256: fileDigest(
      new URL(
        "../adapters/" +
          (definition.model_id === "or-map" ? "or-map" : "yjs") +
          extension,
        import.meta.url,
      ),
    ),
    implementation: Object.freeze(implementation),
    profile: "independent-updates",
    recoveryPolicy: "full-state-exchange-v1",
    observationVersion: "values-only-v1",
    supportedCommands: Object.freeze(["put", "remove"]),
    supportedChecks: Object.freeze(["convergence", "expected-state"]),
  });
  const adapter =
    definition.model_id === "or-map"
      ? createOrMapAdapter(manifest, definition.replicas)
      : createYjsAdapter(manifest, definition.replicas);
  return {
    adapter,
    invariants: createInvariantSet(
      fileDigest(new URL("../verify/checks" + extension, import.meta.url)),
    ),
    engine,
  };
}

export function createEngineIdentity(): EngineIdentity {
  const packageInfo = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const lockfile = new URL("../../pnpm-lock.yaml", import.meta.url);
  return Object.freeze({
    engineVersion: packageInfo.version + (extension === ".ts" ? "-source" : ""),
    engineSha256: treeDigest(codeRoot),
    lockSha256: existsSync(lockfile)
      ? fileDigest(lockfile)
      : digest(new TextEncoder().encode("pnpm-lock.yaml not packaged")),
    randomVersion: "mulberry32-v1",
    schedulerVersion: "arrival-sequence-v1",
    canonicalization: "RFC8785",
  });
}
