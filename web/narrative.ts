import type { TraceEntry } from "./core.js";
import { frameAt, isPartitioned, type Replay } from "./frame.js";

export type RunStats = Readonly<{
  local: number;
  scheduled: number;
  delivered: number;
  dropped: number;
  held: number;
}>;

export type Beat = Readonly<{
  phase: "empty" | "agreed" | "diverged" | "recovering" | "converged";
  headline: string;
  detail: string;
}>;

/** Event counters for the part of the trace already played back. */
export function statsUpTo(trace: readonly TraceEntry[], time: number): RunStats {
  const stats = { local: 0, scheduled: 0, delivered: 0, dropped: 0, held: 0 };
  for (const entry of trace) {
    if (entry.time > time) {
      continue;
    }
    switch (entry.kind) {
      case "local":
        stats.local += 1;
        break;
      case "scheduled":
        stats.scheduled += 1;
        break;
      case "delivered":
        stats.delivered += 1;
        break;
      case "dropped":
        stats.dropped += 1;
        break;
      case "held":
        stats.held += 1;
        break;
      default:
        break;
    }
  }
  return stats;
}

/** What a viewer should understand at this replay position. */
export function beatAt(replay: Replay, time: number): Beat {
  const trace = replay.report.trace;
  if (trace.length === 0) {
    return {
      phase: "empty",
      headline: "아직 실행한 시나리오가 없습니다",
      detail: "위에서 스토리를 고르면 그 자리에서 실행되고 재생됩니다.",
    };
  }
  const frame = frameAt(replay, time);
  const stats = statsUpTo(trace, time);
  const differing = frame.differences.filter((difference) => !difference.agrees);
  const partitioned = isPartitioned(replay.bands, time);
  const healed = trace.some((entry) => entry.kind === "heal" && entry.time <= time);
  const reachedEnd = time >= replay.span[1];

  if (differing.length > 0) {
    return {
      phase: partitioned ? "diverged" : "recovering",
      headline:
        differing.length === 1
          ? `${differing[0]?.key ?? "키"} 값이 복제본마다 다릅니다`
          : `${differing.length}개 키의 값이 복제본마다 다릅니다`,
      detail: [
        partitioned
          ? "분할 중입니다 — 보내려던 메시지가 상대에게 닿지 못하고 보류됩니다"
          : "전달 중입니다 — 아직 도착하지 않은 메시지가 있습니다",
        stats.held > 0 ? `보류 ${stats.held}건` : "",
        stats.dropped > 0 ? `손실 ${stats.dropped}건` : "",
      ]
        .filter((part) => part.length > 0)
        .join(" · "),
    };
  }

  if (reachedEnd && healed) {
    return {
      phase: "converged",
      headline: "복구 후 모든 복제본이 같은 값입니다",
      detail: `보류 ${stats.held}건과 손실 ${stats.dropped}건을 건너뛰고 모든 연산을 신뢰성 있게 다시 보냈습니다 — 전달 ${stats.delivered}건`,
    };
  }

  return {
    phase: "agreed",
    headline: "복제본들이 같은 값을 가지고 있습니다",
    detail: `${stats.local}건의 쓰기·제거 · 전달 ${stats.delivered}건${stats.held > 0 ? ` · 보류 ${stats.held}건` : ""}`,
  };
}
