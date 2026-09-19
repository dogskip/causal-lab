import { describe, expect, it } from "vitest";
import { executeScenario, parseScenario } from "../web/core.js";
import { STORIES } from "../web/stories.js";

/** Every story card promises something; these checks hold the promises to the run. */
describe("story cards", () => {
  it("gives every story a name, a promise, and a source file", () => {
    for (const story of STORIES) {
      expect(story.name.length, story.id).toBeGreaterThan(0);
      expect(story.promise.length, story.id).toBeGreaterThan(10);
      expect(story.source, story.id).toMatch(/^examples\/[a-z-]+\.json$/u);
    }
  });

  it("runs every story and converges after its final heal", () => {
    for (const story of STORIES) {
      const report = executeScenario(parseScenario(story.scenario));
      expect(report.converged, story.id).toBe(true);
    }
  });

  it("keeps both concurrent writes in the concurrent-put story", () => {
    const story = STORIES.find((candidate) => candidate.id === "concurrent-put");
    expect(story).toBeDefined();
    const report = executeScenario(parseScenario(story?.scenario));
    for (const replica of ["a", "b"]) {
      expect(report.states[replica]?.["color"]).toEqual(["blue", "red"]);
    }
  });

  it("keeps the later write and drops the removed one in the observed-remove story", () => {
    const story = STORIES.find((candidate) => candidate.id === "observed-remove");
    expect(story).toBeDefined();
    const report = executeScenario(parseScenario(story?.scenario));
    for (const replica of ["a", "b"]) {
      expect(report.states[replica]?.["k"]).toEqual(["v2"]);
    }
  });

  it("spreads one write to all five replicas in the fan-out story", () => {
    const story = STORIES.find((candidate) => candidate.id === "fan-out");
    expect(story).toBeDefined();
    const report = executeScenario(parseScenario(story?.scenario));
    expect(Object.keys(report.states)).toHaveLength(5);
    for (const state of Object.values(report.states)) {
      expect(state["config"]).toEqual(["v2"]);
    }
  });

  it("lands on the same state with every message duplicated", () => {
    const story = STORIES.find((candidate) => candidate.id === "duplicates");
    expect(story).toBeDefined();
    const duplicated = executeScenario(parseScenario(story?.scenario));
    const scenario = parseScenario(story?.scenario);
    const unique = executeScenario(parseScenario({ ...scenario, config: { ...scenario.config, duplicateRate: 0 } }));
    expect(duplicated.states).toEqual(unique.states);
    expect(duplicated.states["a"]?.["k"]).toEqual(["2"]);
  });
});
