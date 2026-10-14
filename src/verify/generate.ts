import fc from "fast-check";
import { ContractError } from "../crdt.js";
import { parseVerificationCase } from "./case.js";
import { executeVerification } from "./runtime.js";
import type {
  ReplayBundle,
  Status,
  VerificationCase,
  VerificationStep,
  VerifierOptions,
} from "./types.js";

export type GenerationOptions = Readonly<{
  numRuns: number;
  seed: number;
  path?: string;
  onBundle?: (
    bundle: ReplayBundle,
    role: "sample" | "original" | "shrunk",
  ) => void;
}>;
export type GenerationResult = Readonly<{
  status: Status;
  requestedRuns: number;
  actualRuns: number;
  seed: number;
  path: string | null;
  numShrinks: number;
  failureChecks: readonly string[];
  original?: ReplayBundle;
  shrunk?: ReplayBundle;
}>;
export function caseArbitrary(input: unknown): fc.Arbitrary<VerificationCase> {
  const base = parseVerificationCase(input);
  const command = fc.record({
    replica: fc.constantFrom(...base.replicas),
    action: fc.constantFrom("put", "remove"),
    key: fc.constantFrom("k", "mode", "label"),
    value: fc.constantFrom("left", "right", "value", "한글"),
  });
  return fc
    .tuple(
      fc.array(command, { maxLength: 30 }),
      fc.integer({ min: 0, max: 0x7fffffff }),
    )
    .map(([commands, seed]) => {
      const steps: VerificationStep[] = commands.map((item, index) => ({
        at: index,
        action: "command",
        replica: item.replica,
        command:
          item.action === "put"
            ? { action: "put", key: item.key, value: item.value }
            : { action: "remove", key: item.key },
      }));
      steps.push({ at: commands.length + 1, action: "heal" });
      return parseVerificationCase({ ...base, seed, steps });
    });
}
export function generateVerification<S>(
  input: unknown,
  contextFactory: (definition: VerificationCase) => VerifierOptions<S>,
  options: GenerationOptions,
): GenerationResult {
  if (
    !Number.isSafeInteger(options.numRuns) ||
    options.numRuns < 1 ||
    options.numRuns > 10_000 ||
    !Number.isSafeInteger(options.seed) ||
    options.seed < -2147483648 ||
    options.seed > 2147483647
  )
    throw new ContractError("generation bounds are invalid");
  let original: ReplayBundle | undefined;
  let shrunk: ReplayBundle | undefined;
  let failures: readonly string[] = [];
  const ids = (bundle: ReplayBundle) =>
    [
      ...new Set(
        bundle.receipt.checks
          .filter((record) => !record.result.passed)
          .map((record) => record.result.checkId),
      ),
    ].sort();
  const details = fc.check(
    fc.property(caseArbitrary(input), (definition) => {
      const bundle = executeVerification(
        definition,
        contextFactory(definition),
      );
      if (bundle.receipt.status === "passed") {
        if (original === undefined) options.onBundle?.(bundle, "sample");
        return true;
      }
      if (original === undefined) {
        original = bundle;
        failures = ids(bundle);
        options.onBundle?.(bundle, "original");
      }
      if (
        bundle.receipt.status !== original.receipt.status ||
        JSON.stringify(ids(bundle)) !== JSON.stringify(failures) ||
        (failures.length === 0 &&
          bundle.receipt.reason !== original.receipt.reason)
      )
        return true;
      shrunk = bundle;
      return false;
    }),
    {
      numRuns: options.numRuns,
      seed: options.seed,
      ...(options.path === undefined ? {} : { path: options.path }),
    },
  );
  if (shrunk !== undefined) options.onBundle?.(shrunk, "shrunk");
  const status: Status =
    original?.receipt.status ??
    (!details.failed &&
    !details.interrupted &&
    details.numRuns === options.numRuns
      ? "passed"
      : "inconclusive");
  return Object.freeze({
    status,
    requestedRuns: options.numRuns,
    actualRuns: details.numRuns,
    seed: details.seed,
    path: details.counterexamplePath ?? null,
    numShrinks: details.numShrinks,
    failureChecks: Object.freeze([...failures]),
    ...(original === undefined ? {} : { original }),
    ...(shrunk === undefined ? {} : { shrunk }),
  });
}
