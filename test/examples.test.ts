import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario } from "../src/scenario.js";

/**
 * Guards every file under examples/ against drift: each must parse, execute,
 * and (where the example claims convergence) actually converge. Add a new
 * example by dropping a JSON file in examples/ and adding an expectation here.
 */

type Expectation = { converges: boolean };

const expectations: Record<string, Expectation> = {
  "partition-heal.json": { converges: true },
  "concurrent-put.json": { converges: true },
  "observed-remove.json": { converges: true },
  "three-replica-drop.json": { converges: true },
};

const examplesDir = new URL("../examples/", import.meta.url);
const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));

describe("examples/", () => {
  it("the expectations map covers every example file (no orphan, no missing)", () => {
    const files = new Set(exampleFiles);
    const known = new Set(Object.keys(expectations));
    for (const f of files) {
      expect(known.has(f), `examples/${f} has no expectation in examples.test.ts`).toBe(true);
    }
    for (const k of known) {
      expect(files.has(k), `expectation for ${k} but file is missing`).toBe(true);
    }
  });

  for (const file of exampleFiles) {
    describe(file, () => {
      const text = readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8");
      const expectation = expectations[file];

      it("is valid JSON", () => {
        const parse = (): unknown => JSON.parse(text);
        expect(parse).not.toThrow();
        expect(typeof parse()).toBe("object");
      });

      it("parses and executes without a contract violation", () => {
        const scenario = parseScenario(JSON.parse(text) as unknown);
        expect(() => executeScenario(scenario)).not.toThrow();
      });

      if (expectation !== undefined) {
        it(`converges=${expectation.converges}`, () => {
          const scenario = parseScenario(JSON.parse(text) as unknown);
          const report = executeScenario(scenario);
          expect(report.converged).toBe(expectation.converges);
        });
      }
    });
  }
});
