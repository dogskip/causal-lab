import { readBundle, statesAt } from "../src/verify/bundle.js";
import { jcs } from "../src/verify/json.js";
import type { ReplayBundle } from "../src/verify/types.js";
const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (found === null) throw new Error("missing element " + id);
  return found as T;
};
const file = element<HTMLInputElement>("verification-file");
const result = element("verification-result");
const error = element("verification-error");
const slider = element<HTMLInputElement>("verification-sequence");
const labels = {
  passed: "통과",
  failed: "실패",
  inconclusive: "판정 불가",
  error: "실행 오류",
};
const kinds = {
  command: "명령",
  scheduled: "전달 예정",
  dropped: "손실",
  held: "보류",
  delivery: "전달",
  partition: "분할",
  heal: "회복 시작",
  reconcile: "상태 교환",
  "recovery-complete": "회복 완료",
};
let bundle: ReplayBundle | undefined;
let generation = 0;
function render(sequence: number): void {
  if (bundle === undefined) return;
  slider.value = String(sequence);
  const event = bundle.receipt.events[sequence - 1];
  element("verification-event").textContent =
    event === undefined
      ? "사건 0 · 실제 초기 상태"
      : `사건 ${sequence} / ${bundle.receipt.events.length} · 시각 ${event.time} · ${kinds[event.kind]}${event.from === undefined ? "" : ` · ${event.from}${event.to === undefined ? "" : ` → ${event.to}`}`}`;
  element("verification-states").textContent = JSON.stringify(
    statesAt(bundle, sequence),
    null,
    2,
  );
  element("verification-evidence").textContent = JSON.stringify(
    event ?? bundle.receipt.initialStates,
    null,
    2,
  );
  element<HTMLButtonElement>("verification-previous").disabled = sequence === 0;
  element<HTMLButtonElement>("verification-next").disabled =
    sequence === bundle.receipt.events.length;
}
async function importFile(): Promise<void> {
  const version = ++generation;
  bundle = undefined;
  result.hidden = true;
  error.textContent = "";
  const selected = file.files?.[0];
  if (selected === undefined) return;
  try {
    if (selected.size > 32 * 1024 * 1024) throw new Error("size");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await selected.arrayBuffer(),
    );
    const verified = readBundle(text);
    if (version !== generation) return;
    bundle = verified;
    element("verification-status").textContent = labels[bundle.receipt.status];
    element("verification-reason").textContent = bundle.receipt.reason;
    const info = element("verification-info");
    info.replaceChildren();
    for (const [name, value] of [
      ["대상", bundle.receipt.manifest.model_id],
      ["정의 ID", bundle.case_id],
      ["실행 ID", bundle.run_id],
      ["전달", String(bundle.receipt.counts.deliveredMessages)],
      ["명령", String(bundle.receipt.counts.committedCommands)],
    ]) {
      const term = document.createElement("dt");
      term.textContent = name!;
      const detail = document.createElement("dd");
      detail.textContent = value!;
      info.append(term, detail);
    }
    const checks = element("verification-checks");
    checks.replaceChildren();
    if (bundle.receipt.checks.length === 0)
      checks.textContent = "아직 완료한 규칙 검사가 없습니다.";
    for (const check of bundle.receipt.checks) {
      const row = document.createElement("details");
      row.className = "check";
      row.dataset.passed = String(check.result.passed);
      const heading = document.createElement("summary");
      heading.textContent = `${check.result.passed ? "통과" : "실패"} · ${check.result.checkId} · ${check.phase} · 사건 ${check.eventSequence}`;
      const reason = document.createElement("p");
      reason.textContent = check.result.reason;
      const evidence = document.createElement("pre");
      evidence.textContent = JSON.stringify(check.result.evidence, null, 2);
      row.append(heading, reason, evidence);
      checks.append(row);
    }
    slider.max = String(bundle.receipt.events.length);
    result.hidden = false;
    render(0);
  } catch {
    if (version !== generation) return;
    error.textContent =
      "검증 파일을 확인할 수 없습니다. 형식, 크기, 해시 또는 기록 일관성이 잘못되었습니다.";
  }
}
file.addEventListener("change", () => {
  void importFile();
});
slider.addEventListener("input", () => render(Number(slider.value)));
element("verification-initial").addEventListener("click", () => render(0));
element("verification-final").addEventListener("click", () => {
  if (bundle !== undefined) render(bundle.receipt.events.length);
});
element("verification-previous").addEventListener("click", () =>
  render(Math.max(0, Number(slider.value) - 1)),
);
element("verification-next").addEventListener("click", () => {
  if (bundle !== undefined)
    render(Math.min(bundle.receipt.events.length, Number(slider.value) + 1));
});
element("verification-download").addEventListener("click", () => {
  if (bundle === undefined) return;
  const url = URL.createObjectURL(
    new Blob([jcs(bundle) + "\n"], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = bundle.run_id + ".bundle.json";
  anchor.click();
  URL.revokeObjectURL(url);
});
