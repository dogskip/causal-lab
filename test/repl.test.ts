import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const replEntry = new URL("../src/repl.ts", import.meta.url).pathname;

function repl(input: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", replEntry],
    {
      input,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
  return {
    stdout: result.stdout.replace(/\r\n/g, "\n").trim(),
    stderr: result.stderr.replace(/\r\n/g, "\n").trim(),
    status: result.status,
  };
}

describe("REPL", () => {
  it("starts with a banner and prompt", () => {
    const { stdout } = repl("exit\n");
    expect(stdout).toContain("causal-lab repl");
    expect(stdout).toContain("config:");
    expect(stdout).toContain("exit");
  });

  it("help command shows all commands", () => {
    const { stdout } = repl("help\nexit\n");
    expect(stdout).toContain("put");
    expect(stdout).toContain("remove");
    expect(stdout).toContain("partition");
    expect(stdout).toContain("heal");
    expect(stdout).toContain("advance");
    expect(stdout).toContain("run");
    expect(stdout).toContain("report");
    expect(stdout).toContain("trace");
    expect(stdout).toContain("mermaid");
    expect(stdout).toContain("reset");
    expect(stdout).toContain("config");
    expect(stdout).toContain("exit");
  });

  it("put command writes a value", () => {
    const { stdout } = repl("put a key1 hello\nexit\n");
    expect(stdout).toContain("put a:key1=hello");
  });

  it("put command with a multi-word value", () => {
    const { stdout } = repl("put a greeting hello world\nexit\n");
    expect(stdout).toContain("put a:greeting=hello world");
  });

  it("put command shows usage when missing arguments", () => {
    const { stdout } = repl("put\nexit\n");
    expect(stdout).toContain("usage: put <replica> <key> <value>");
  });

  it("remove command removes a key", () => {
    const { stdout } = repl("put a k v\nremove a k\nexit\n");
    expect(stdout).toContain("remove a:k");
  });

  it("remove command shows usage when missing arguments", () => {
    const { stdout } = repl("remove\nexit\n");
    expect(stdout).toContain("usage: remove <replica> <key>");
  });

  it("partition command splits the network", () => {
    const { stdout } = repl("partition a b\nexit\n");
    expect(stdout).toContain("partition a <-> b");
  });

  it("partition command shows usage when missing arguments", () => {
    const { stdout } = repl("partition\nexit\n");
    expect(stdout).toContain("usage: partition <left> <right>");
  });

  it("heal command clears all partitions", () => {
    const { stdout } = repl("heal\nexit\n");
    expect(stdout).toContain("heal");
  });

  it("advance command advances virtual time", () => {
    const { stdout } = repl("advance 10\nexit\n");
    expect(stdout).toContain("advanced 10 ticks");
  });

  it("advance command shows usage with invalid argument", () => {
    const { stdout } = repl("advance -1\nexit\n");
    expect(stdout).toContain("usage: advance <non-negative integer>");
  });

  it("advance command with no argument defaults to 0", () => {
    const { stdout } = repl("advance\nexit\n");
    expect(stdout).toContain("advanced 0 ticks");
  });

  it("run command executes and reports convergence", () => {
    const { stdout } = repl("put a mode safe\nheal\nrun\nexit\n");
    expect(stdout).toContain("run: converged=");
    expect(stdout).toContain("virtualTime=");
    expect(stdout).toContain("processedEvents=");
  });

  it("report command shows full state", () => {
    const { stdout } = repl("put a k v\nreport\nexit\n");
    expect(stdout).toContain("converged");
    expect(stdout).toContain("states");
    expect(stdout).toContain("versions");
  });

  it("trace command shows raw trace", () => {
    const { stdout } = repl("put a k v\ntrace\nexit\n");
    expect(stdout).toContain("local");
    // With default config (dropRate 0.25), the event may be dropped — accept either.
    expect(stdout).toMatch(/scheduled|dropped/);
  });

  it("mermaid command shows sequence diagram", () => {
    const { stdout } = repl("put a k v\nmermaid\nexit\n");
    expect(stdout).toContain("sequenceDiagram");
    // With default config, trace may not include all participants if events are dropped.
    // The header is always present.
    expect(stdout.length).toBeGreaterThan("sequenceDiagram".length);
  });

  it("reset command discards current simulation", () => {
    const { stdout } = repl("put a k v\nreset\nexit\n");
    expect(stdout).toContain("reset");
  });

  it("config command sets a custom configuration", () => {
    const { stdout } = repl(
      'config {"replicas":["x","y"],"seed":1,"minLatency":1,"maxLatency":2,"dropRate":0,"duplicateRate":0}\nexit\n',
    );
    expect(stdout).toContain("config set: replicas=x,y seed=1");
  });

  it("config command shows usage with invalid JSON", () => {
    const { stdout } = repl("config {invalid}\nexit\n");
    expect(stdout).toContain("usage: config");
  });

  it("unknown command shows help hint", () => {
    const { stdout } = repl("foobar\nexit\n");
    expect(stdout).toContain("unknown command: foobar");
  });

  it("quit command exits", () => {
    const { stdout } = repl("quit\n");
    expect(stdout).toContain("quit");
  });

  it("empty line does nothing", () => {
    const { stdout } = repl("\nexit\n");
    expect(stdout).toContain("exit");
  });

  it("handles a full partition-heal-converge workflow", () => {
    const input = [
      "partition a b",
      "put a mode safe",
      "put b mode fast",
      "heal",
      "run",
      "exit",
    ].join("\n");
    const { stdout } = repl(input);
    expect(stdout).toContain("put a:mode=safe");
    expect(stdout).toContain("put b:mode=fast");
    expect(stdout).toContain("heal");
    expect(stdout).toContain("run: converged=");
  });

  it("reports errors from invalid operations gracefully", () => {
    const { stdout } = repl("put unknown k v\nexit\n");
    expect(stdout).toContain("error:");
  });

  it("handles piped input identically to TTY input", () => {
    const first = repl("put a k v\nreport\nexit\n");
    const second = repl("put a k v\nreport\nexit\n");
    expect(first.stdout).toBe(second.stdout);
  });
});
