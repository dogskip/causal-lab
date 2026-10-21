import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { ContractError } from "../crdt.js";
import { parseVerificationCase } from "../verify/case.js";
import { readBundle } from "../verify/bundle.js";
import { generateVerification } from "../verify/generate.js";
import { jcs, objectOf, parseJsonText } from "../verify/json.js";
import { executeVerification, replayVerification } from "../verify/runtime.js";
import type {
  ReplayBundle,
  VerificationCase,
  VerifierOptions,
} from "../verify/types.js";
import { createBuiltinContext, createEngineIdentity } from "./registry.js";
const emit = (value: unknown) => process.stdout.write(jcs(value) + "\n");
console.log = (...values: unknown[]) => console.error(...values);
try {
  const request = objectOf(
    parseJsonText(
      new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(0)),
      34 * 1024 * 1024,
    ),
    "worker request",
  );
  let module:
    | {
        createContext?: (
          definition: VerificationCase,
          engine: ReturnType<typeof createEngineIdentity>,
        ) => VerifierOptions<unknown>;
      }
    | undefined;
  let moduleHash: string | undefined;
  if (typeof request.module === "string") {
    moduleHash = createHash("sha256")
      .update(readFileSync(request.module))
      .digest("hex");
    module = (await import(
      pathToFileURL(request.module).href
    )) as typeof module;
    if (typeof module?.createContext !== "function")
      throw new ContractError("module must export synchronous createContext");
  }
  const engine = createEngineIdentity();
  const context = (definition: VerificationCase): VerifierOptions<unknown> => {
    if (module === undefined) return createBuiltinContext(definition);
    const options = module.createContext!(definition, engine);
    if (options === null || typeof options !== "object" || "then" in options)
      throw new ContractError(
        "createContext must return synchronous verification options",
      );
    return {
      ...options,
      engine,
      adapter: {
        create: options.adapter.create.bind(options.adapter),
        command: options.adapter.command.bind(options.adapter),
        receive: options.adapter.receive.bind(options.adapter),
        reconcile: options.adapter.reconcile.bind(options.adapter),
        observe: options.adapter.observe.bind(options.adapter),
        close: options.adapter.close.bind(options.adapter),
        manifest: { ...options.adapter.manifest, adapterSha256: moduleHash! },
      },
    };
  };
  const record = (bundle: ReplayBundle, role = "result") => {
    emit({ type: "receipt", role, bundle });
  };
  if (request.mode === "replay") {
    const bundle = readBundle(request.input);
    const replay = replayVerification(bundle, context(bundle.caseDefinition));
    record(replay);
    emit({ type: "summary", status: replay.receipt.status, matched: true });
  } else {
    const definition = parseVerificationCase(request.input);
    if (request.runs !== undefined) {
      const result = generateVerification(definition, context, {
        numRuns: request.runs as number,
        seed: request.seed as number,
        ...(typeof request.path === "string" ? { path: request.path } : {}),
        onBundle: record,
      });
      emit({
        type: "summary",
        status: result.status,
        requestedRuns: result.requestedRuns,
        actualRuns: result.actualRuns,
        seed: result.seed,
        path: result.path,
        numShrinks: result.numShrinks,
        failureChecks: result.failureChecks,
        replicas: definition.replicas.length,
        steps: definition.steps.length,
      });
    } else {
      const bundle = executeVerification(definition, context(definition));
      record(bundle);
      emit({
        type: "summary",
        status: bundle.receipt.status,
        seed: definition.seed,
        replicas: definition.replicas.length,
        steps: definition.steps.length,
      });
    }
  }
} catch {
  emit({
    type: "summary",
    status: "error",
    reason:
      "invalid input, incompatible execution or target initialization failed",
  });
  process.exitCode = 2;
}
