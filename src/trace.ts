import type { TraceEntry } from "./simulation.js";

/**
 * Pure converter from a simulation trace to a Mermaid `sequenceDiagram`.
 *
 * Why this exists: the trace is an ordered list of low-level events; reading
 * `partition(a,b) -> put a -> dropped(a->b) -> heal -> delivered(a->b)` as JSON
 * is hard for a newcomer. A sequence diagram shows who-talks-to-whom and where
 * messages get dropped or held, at a glance.
 *
 * Determinism: this function is pure and order-preserving. The same trace always
 * yields the same Mermaid text. It touches no I/O, no clock, no RNG.
 *
 * Render the output with any Mermaid renderer (GitHub markdown, mermaid.live,
 * `mmdc`, IDE preview). It is a developer-facing artifact, not part of the
 * simulation contract.
 */
export function traceToMermaid(trace: readonly TraceEntry[]): string {
  const participants = new Set<string>();
  for (const entry of trace) {
    if (entry.from !== undefined) participants.add(entry.from);
    if (entry.to !== undefined) participants.add(entry.to);
  }
  // Sort for stable participant order across runs. Determinism requires this
  // not to depend on insertion order of a Set.
  const ordered = [...participants].sort();
  const header = ["sequenceDiagram", ...ordered.map((p) => `participant ${p}`)];

  const lines: string[] = [];
  for (const entry of trace) {
    const note = mermaidNote(entry);
    if (note === null) continue;
    lines.push(note);
  }
  return [...header, ...lines].join("\n");
}

function mermaidNote(entry: TraceEntry): string | null {
  const t = entry.time;
  const dot = entry.operation ?? "";
  switch (entry.kind) {
    case "local":
      return note(entry.from ?? "?", `local ${dot} (t=${t})`);
    case "scheduled":
      return arrow(entry.from ?? "?", entry.to ?? "?", `->> schedule ${dot} (t=${t})`);
    case "dropped":
      return arrow(entry.from ?? "?", entry.to ?? "?", `--x drop ${dot} (t=${t})`);
    case "held":
      return arrow(entry.from ?? "?", entry.to ?? "?", `--) hold ${dot} (t=${t})`);
    case "delivered":
      return arrow(entry.from ?? "?", entry.to ?? "?", `->> deliver ${dot} (t=${t})`);
    case "partition":
      return note(entry.from ?? "?", `partition ${entry.from ?? ""}<->${entry.to ?? ""} (t=${t})`);
    case "heal":
      return note(entry.from ?? "system", `heal (t=${t})`);
    default:
      return null;
  }
}

function arrow(from: string, to: string, label: string): string {
  return `${from} ${label}: ${to}`;
}

function note(actor: string, label: string): string {
  return `Note over ${actor}: ${label}`;
}
