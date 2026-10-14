import {
  MAX_SCENARIO_BYTES,
  executeScenario,
  parseScenario,
  scenarioIdentity,
  utf8Length,
  type Scenario,
  type ScenarioStep,
  type SimulationConfig,
  type SimulationReport,
  type TraceEntry,
} from "./core.js";
import { createReplay, frameAt, type Frame, type Replay, type Snapshot } from "./frame.js";
import { beatAt, statsUpTo } from "./narrative.js";
import { STORIES, type Story } from "./stories.js";

const PLAY_SECONDS = 6;

const CONFIG_FIELDS: ReadonlyArray<readonly [keyof SimulationConfig, string, string]> = [
  ["replicas", "복제본(쉼표)", "a,b"],
  ["seed", "seed", "19"],
  ["minLatency", "minLatency", "1"],
  ["maxLatency", "maxLatency", "3"],
  ["dropRate", "dropRate", "0.25"],
  ["duplicateRate", "duplicateRate", "0.5"],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (content !== undefined) {
    node.textContent = content;
  }
  return node;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`missing element: ${id}`);
  }
  return found as T;
}

type Mark = Readonly<{ x: number; y: number; entry: TraceEntry }>;

const storiesBox = element<HTMLUListElement>("stories");
const canvas = element<HTMLCanvasElement>("timeline");
const scrub = element<HTMLInputElement>("scrub");
const clock = element<HTMLOutputElement>("clock");
const beat = element<HTMLParagraphElement>("beat");
const beatDetail = element<HTMLParagraphElement>("beat-detail");
const counters = element<HTMLParagraphElement>("counters");
const detailsLine = element<HTMLParagraphElement>("details");
const stateTable = element<HTMLTableElement>("state-table");
const verdictBox = element<HTMLDListElement>("verdict");
const scenarioLine = element<HTMLParagraphElement>("scenario-line");
const errorLine = element<HTMLParagraphElement>("error");
const stepTable = element<HTMLTableElement>("step-table");
const stepBody = stepTable.tBodies[0] ?? stepTable.createTBody();
const configRow = element<HTMLParagraphElement>("config-row");
const speedSelect = element<HTMLSelectElement>("speed");
const playButton = element<HTMLButtonElement>("play");
const actionSelect = element<HTMLSelectElement>("step-action");
const copyButton = element<HTMLButtonElement>("copy");
const downloadButton = element<HTMLButtonElement>("download");
const fileInput = element<HTMLInputElement>("file-input");

const inputs = new Map<keyof SimulationConfig, HTMLInputElement>();
let draftSteps: ScenarioStep[] = [];
let currentStory: Story | undefined;
let currentScenario: Scenario | undefined;
let receiptId = "";
let replay: Replay | undefined;
let playhead = 0;
let playHandle = 0;
let speed = 1;
let marks: Mark[] = [];

for (const [name, label, value] of CONFIG_FIELDS) {
  const input = el("input");
  input.value = value;
  input.size = 8;
  input.addEventListener("change", () => {
    runScenario();
  });
  configRow.append(`${label} `, input, " ");
  inputs.set(name, input);
}

for (const action of ["put", "remove", "partition", "heal"]) {
  const option = el("option", action);
  option.value = action;
  actionSelect.append(option);
}

function readConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [name, input] of inputs) {
    const raw = input.value;
    config[name] = name === "replicas" ? raw.split(",").map((part) => part.trim()) : Number(raw);
  }
  return config;
}

function writeConfig(config: SimulationConfig): void {
  for (const [name, input] of inputs) {
    const value = config[name];
    input.value = Array.isArray(value) ? value.join(",") : String(value);
  }
}

function describeStep(step: ScenarioStep): string {
  switch (step.action) {
    case "put":
      return `${step.replica} ${step.key} = ${step.value}`;
    case "remove":
      return `${step.replica} ${step.key} 삭제`;
    case "partition":
      return `${step.left}와 ${step.right} 연결 끊기`;
    case "heal":
      return "모든 연결 복구 + 재전송";
  }
}

function summarizeSteps(steps: readonly ScenarioStep[]): string {
  const shown = steps.slice(0, 6).map((step) => `${describeStep(step)} (t=${step.at})`);
  const rest = steps.length - shown.length;
  return `${shown.join(" → ")}${rest > 0 ? ` → …외 ${rest}개` : ""}`;
}

const withTime = (step: ScenarioStep, at: number): ScenarioStep => ({ ...step, at });

/** The engine consumes steps in time order, so the editor keeps them sorted. */
function sortSteps(): void {
  draftSteps = draftSteps
    .map((step, index) => ({ step, index }))
    .sort((left, right) => left.step.at - right.step.at || left.index - right.index)
    .map((carried) => carried.step);
}

function renderSteps(): void {
  stepBody.replaceChildren();
  for (const [index, step] of draftSteps.entries()) {
    const row = stepBody.insertRow();
    row.insertCell().textContent = String(index + 1);

    const timeInput = el("input");
    timeInput.type = "number";
    timeInput.min = "0";
    timeInput.step = "1";
    timeInput.value = String(step.at);
    timeInput.addEventListener("change", () => {
      draftSteps[index] = withTime(step, Number(timeInput.value));
      sortSteps();
      renderSteps();
      runScenario();
    });
    row.insertCell().append(timeInput);

    row.insertCell().textContent = step.action;
    row.insertCell().textContent = describeStep(step);

    const remove = el("button", "삭제");
    remove.type = "button";
    remove.addEventListener("click", () => {
      draftSteps.splice(index, 1);
      renderSteps();
      runScenario();
    });
    row.insertCell().append(remove);
  }
}

function renderStories(): void {
  storiesBox.replaceChildren();
  for (const story of STORIES) {
    const item = el("li");
    const button = el("button", story.name);
    const selected = story === currentStory;
    button.type = "button";
    button.disabled = selected;
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => {
      selectStory(story, true);
    });
    item.append(button, ` ${story.promise} `, el("code", story.source));
    storiesBox.append(item);
  }
}

function selectStory(story: Story, autoplay: boolean): void {
  currentStory = story;
  const parsed = parseScenario(story.scenario);
  draftSteps = [...parsed.steps];
  writeConfig(parsed.config);
  renderSteps();
  renderStories();
  runScenario(autoplay);
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  errorLine.textContent = `시나리오를 실행할 수 없습니다 — ${message}`;
}

function runScenario(autoplay = false): void {
  stop();
  errorLine.textContent = "";
  let scenario: Scenario;
  try {
    scenario = parseScenario({ config: readConfig(), steps: draftSteps });
  } catch (error) {
    fail(error);
    return;
  }
  const snapshots: Snapshot[] = [{ at: 0, states: Object.fromEntries(scenario.config.replicas.map((id) => [id, {}])) }];
  let report: SimulationReport;
  try {
    report = executeScenario(scenario, undefined, (event, states) => {
      snapshots.push({ at: event.time, states });
    });
  } catch (error) {
    fail(error);
    return;
  }
  snapshots.push({ at: report.virtualTime, states: report.states });
  currentScenario = scenario;
  receiptId = scenarioIdentity(scenario).id;
  replay = createReplay(report, snapshots);
  playhead = replay.span[1];
  scrub.min = "0";
  scrub.max = String(replay.span[1]);
  scrub.value = String(playhead);
  render();
  if (autoplay && !prefersReducedMotion()) {
    startPlayback();
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stop(): void {
  if (playHandle !== 0) {
    cancelAnimationFrame(playHandle);
    playHandle = 0;
  }
  playButton.textContent = "재생";
}

function startPlayback(): void {
  if (replay === undefined || replay.span[1] <= 0) {
    return;
  }
  const total = replay.span[1];
  const from = playhead >= total ? 0 : playhead;
  const started = performance.now();
  const rate = Math.max(1, (total / PLAY_SECONDS) * speed);
  playButton.textContent = "일시정지";
  const step = (now: number): void => {
    playhead = Math.min(total, from + ((now - started) / 1000) * rate);
    scrub.value = String(playhead);
    render();
    if (playhead < total) {
      playHandle = requestAnimationFrame(step);
    } else {
      playHandle = 0;
      playButton.textContent = "재생";
      render();
    }
  };
  playHandle = requestAnimationFrame(step);
}

function eventTimes(): number[] {
  if (replay === undefined) {
    return [];
  }
  return [...new Set(replay.report.trace.map((entry) => entry.time))].sort((left, right) => left - right);
}

function jump(direction: 1 | -1): void {
  const times = eventTimes();
  const next =
    direction === 1
      ? times.find((time) => time > playhead + 1e-9)
      : [...times].reverse().find((time) => time < playhead - 1e-9);
  playhead = next ?? (direction === 1 ? (replay?.span[1] ?? 0) : 0);
  scrub.value = String(playhead);
  render();
}

function formatTime(time: number): string {
  return `t=${Math.round(time * 100) / 100}`;
}

function render(): void {
  if (replay === undefined) {
    return;
  }
  const frame = frameAt(replay, playhead);
  const narrative = beatAt(replay, playhead);
  const stats = statsUpTo(replay.report.trace, playhead);
  clock.value = formatTime(frame.time);
  scenarioLine.textContent = draftSteps.length === 0 ? "스텝이 없습니다" : summarizeSteps(draftSteps);
  beat.textContent = narrative.headline;
  const finished = replay.span[1] > 0 && frame.time >= replay.span[1] && playHandle === 0;
  beatDetail.textContent = finished ? `${narrative.detail} · Space로 다시 보기` : narrative.detail;
  counters.textContent = [
    `쓰기·제거 ${stats.local}`,
    `전송 대기 ${stats.scheduled}`,
    `도착 ${stats.delivered}`,
    `보류 ${stats.held}`,
    `손실 ${stats.dropped}`,
  ].join(" · ");
  draw(frame);
  renderStateTable(frame);
  renderReceipt(frame);
}

function renderStateTable(frame: Frame): void {
  const replicaIds = Object.keys(frame.states);
  stateTable.replaceChildren();
  const headRow = stateTable.createTHead().insertRow();
  headRow.insertCell().textContent = "key";
  for (const replica of replicaIds) {
    headRow.insertCell().textContent = replica;
  }

  const body = stateTable.tBodies[0] ?? stateTable.createTBody();
  if (frame.differences.length === 0) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = replicaIds.length + 1;
    cell.textContent = "아직 값이 없습니다";
    return;
  }
  for (const difference of frame.differences) {
    const row = body.insertRow();
    const keyCell = row.insertCell();
    keyCell.textContent = difference.key;
    if (!difference.agrees) {
      keyCell.append(" ≠");
    }
    for (const replica of replicaIds) {
      const values = difference.values[replica] ?? [];
      const cell = row.insertCell();
      if (values.length === 0) {
        cell.textContent = "—";
      } else if (difference.agrees) {
        cell.textContent = values.join(" ");
      } else {
        cell.append(el("b", values.join(" ")));
      }
    }
  }
}

function renderReceipt(frame: Frame): void {
  verdictBox.replaceChildren();
  const converged = replay?.report.converged === true;
  const differing = frame.differences.filter((difference) => !difference.agrees).length;
  const entries: ReadonlyArray<readonly [string, string]> = [
    ["결과", converged ? "수렴" : "미수렴"],
    ["화면", `${formatTime(frame.time)} · ${differing === 0 ? "복제본 값 동일" : `키 ${differing}개 불일치`}`],
    ["사건", `${replay?.report.processedEvents ?? 0}건 처리`],
    ["시나리오", currentStory?.source ?? "직접 편집"],
    ["영수증", receiptId],
  ];
  for (const [term, value] of entries) {
    verdictBox.append(el("dt", term), el("dd", value));
  }
}

function syncCanvasSize(): { width: number; height: number; ratio: number } {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(200, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width: canvas.clientWidth, height: canvas.clientHeight, ratio };
}

function draw(frame: Frame): void {
  const context = canvas.getContext("2d");
  if (context === null || replay === undefined) {
    return;
  }
  const { width, height, ratio } = syncCanvasSize();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const color = getComputedStyle(document.body).color;
  const lanes = Object.keys(frame.states);
  const laneIndex = new Map(lanes.map((id, index) => [id, index]));
  const gutter = 62;
  const top = 30;
  const bottom = 30;
  const laneHeight = Math.min(76, Math.max(30, (height - top - bottom) / Math.max(lanes.length, 1)));
  const blockTop = top + Math.max(0, (height - top - bottom - laneHeight * lanes.length) / 2);
  const total = Math.max(replay.span[1], 1);
  const x = (time: number): number => gutter + (time / total) * (width - gutter - 14);
  const laneY = (id: string): number => blockTop + ((laneIndex.get(id) ?? 0) + 0.5) * laneHeight;

  context.font = "12px sans-serif";
  context.strokeStyle = color;
  context.fillStyle = color;
  const tickStep = total <= 12 ? 1 : Math.ceil(total / 10);
  for (let time = 0; time <= total; time += tickStep) {
    const tickX = x(time);
    context.globalAlpha = 0.25;
    context.beginPath();
    context.moveTo(tickX, top - 8);
    context.lineTo(tickX, height - bottom + 4);
    context.stroke();
    context.globalAlpha = 0.65;
    context.fillText(String(time), tickX - 4, height - bottom + 18);
  }
  context.globalAlpha = 1;

  for (const band of frame.bands) {
    const fromY = laneY(band.from);
    const toY = laneY(band.to);
    const bandTop = Math.min(fromY, toY) - laneHeight / 2;
    const bandHeight = Math.abs(toY - fromY) + laneHeight;
    const left = x(band.start);
    const right = x(band.end ?? frame.time);
    context.globalAlpha = 0.06;
    context.fillRect(left, bandTop, Math.max(right - left, 1), bandHeight);
    context.globalAlpha = 0.4;
    context.setLineDash([2, 3]);
    context.beginPath();
    context.moveTo(left, bandTop);
    context.lineTo(right, bandTop);
    context.moveTo(left, bandTop + bandHeight);
    context.lineTo(right, bandTop + bandHeight);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 0.6;
    if (right - left > 46) {
      context.fillText("분할 구간", left + 4, bandTop + bandHeight - 4);
    }
    context.globalAlpha = 1;
  }

  // The axis shows the whole scenario, with the part still to come drawn faintly.
  for (const entry of replay.report.trace) {
    if (entry.kind !== "partition" && entry.kind !== "heal") {
      continue;
    }
    const markerX = x(entry.time);
    context.globalAlpha = entry.time > frame.time ? 0.25 : 0.6;
    context.setLineDash([2, 3]);
    context.beginPath();
    context.moveTo(markerX, top - 8);
    context.lineTo(markerX, height - bottom + 4);
    context.stroke();
    context.setLineDash([]);
    context.fillText(entry.kind === "heal" ? "복구" : "분할", markerX + 3, top - 2);
  }
  context.globalAlpha = 1;

  for (const id of lanes) {
    const y = laneY(id);
    context.globalAlpha = 0.3;
    context.beginPath();
    context.moveTo(gutter - 8, y);
    context.lineTo(width - 14, y);
    context.stroke();
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(16, y, 3, 0, Math.PI * 2);
    context.fill();
    context.fillText(id, 26, y + 4);
  }

  marks = [];
  for (const entry of frame.entries) {
    const future = entry.time > frame.time;
    context.globalAlpha = future ? 0.4 : 1;
    const entryX = x(entry.time);
    if (entry.kind === "local" && entry.from !== undefined) {
      context.beginPath();
      context.arc(entryX, laneY(entry.from), 3.5, 0, Math.PI * 2);
      context.fill();
      marks.push({ x: entryX, y: laneY(entry.from), entry });
      context.globalAlpha = 1;
      continue;
    }
    if (entry.from === undefined || entry.to === undefined || !laneIndex.has(entry.from) || !laneIndex.has(entry.to)) {
      context.globalAlpha = 1;
      continue;
    }
    const fromY = laneY(entry.from);
    const toY = laneY(entry.to);
    const bulge = (entry.sequence % 2 === 0 ? 1 : -1) * 12;
    const midY = (fromY + toY) / 2;
    const style =
      entry.kind === "delivered"
        ? { dash: [] as number[], width: 2, alpha: 1 }
        : entry.kind === "dropped"
          ? { dash: [4, 3], width: 1.6, alpha: 1 }
          : entry.kind === "held"
            ? { dash: [1, 3], width: 1.6, alpha: 1 }
            : { dash: [] as number[], width: 1, alpha: 0.35 };
    context.globalAlpha = future ? style.alpha * 0.4 : style.alpha;
    context.lineWidth = style.width;
    context.setLineDash(style.dash);
    context.beginPath();
    context.moveTo(entryX, fromY);
    context.quadraticCurveTo(entryX + bulge, midY, entryX, toY);
    context.stroke();
    context.setLineDash([]);
    context.lineWidth = 1;
    if (entry.kind === "delivered") {
      context.beginPath();
      context.moveTo(entryX, toY);
      context.lineTo(entryX - 4, toY - (toY > fromY ? 7 : -7));
      context.lineTo(entryX + 4, toY - (toY > fromY ? 7 : -7));
      context.closePath();
      context.fill();
    } else if (entry.kind === "dropped" || entry.kind === "held") {
      context.fillText(entry.kind === "dropped" ? "×" : "‖", entryX + bulge - 3, midY + 4);
    }
    marks.push({ x: entryX, y: midY, entry });
  }
  context.globalAlpha = 1;

  const headX = x(frame.time);
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(headX, top - 14);
  context.lineTo(headX, height - bottom + 4);
  context.stroke();
  context.lineWidth = 1;
  context.font = "bold 12px sans-serif";
  const headLabel = formatTime(frame.time);
  const headWidth = context.measureText(headLabel).width;
  context.fillText(headLabel, Math.min(headX + 4, width - headWidth - 2), top - 4);
  context.font = "12px sans-serif";
}

function showEventDetails(clientX: number, clientY: number): void {
  const bounds = canvas.getBoundingClientRect();
  const x = ((clientX - bounds.left) / bounds.width) * canvas.clientWidth;
  const y = ((clientY - bounds.top) / bounds.height) * canvas.clientHeight;
  let nearest: Readonly<{ distance: number; entry: TraceEntry }> | undefined;
  for (const mark of marks) {
    const distance = Math.hypot(mark.x - x, mark.y - y);
    if (distance <= 12 && (nearest === undefined || distance < nearest.distance)) {
      nearest = { distance, entry: mark.entry };
    }
  }
  if (nearest === undefined) {
    detailsLine.textContent = "";
    return;
  }
  const { entry } = nearest;
  const verb: Record<string, string> = {
    local: "로컬 쓰기",
    scheduled: "전송 예약",
    delivered: "도착 적용",
    dropped: "손실",
    held: "보류",
    partition: "분할",
    heal: "복구",
  };
  const where = entry.to === undefined ? (entry.from ?? "") : `${entry.from ?? ""} → ${entry.to}`;
  detailsLine.textContent = `#${entry.sequence} t=${entry.time} · ${verb[entry.kind] ?? entry.kind} · ${where}${entry.operation === undefined ? "" : ` · ${entry.operation}`}`;
}

function addStep(): void {
  const at = Number(element<HTMLInputElement>("step-at").value);
  const replica = element<HTMLInputElement>("step-replica").value;
  const key = element<HTMLInputElement>("step-key").value;
  const value = element<HTMLInputElement>("step-value").value;
  switch (actionSelect.value) {
    case "put":
      draftSteps.push({ at, action: "put", replica, key, value });
      break;
    case "remove":
      draftSteps.push({ at, action: "remove", replica, key });
      break;
    case "partition":
      draftSteps.push({
        at,
        action: "partition",
        left: element<HTMLInputElement>("step-left").value,
        right: element<HTMLInputElement>("step-right").value,
      });
      break;
    default:
      draftSteps.push({ at, action: "heal" });
  }
  sortSteps();
  renderSteps();
  runScenario();
}

function loadScenario(input: unknown): void {
  const scenario = parseScenario(input);
  currentStory = undefined;
  draftSteps = [...scenario.steps];
  writeConfig(scenario.config);
  renderSteps();
  renderStories();
  runScenario();
}

function downloadScenario(): void {
  if (currentScenario === undefined) {
    return;
  }
  const blob = new Blob([`${JSON.stringify(currentScenario, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = `${currentStory?.id ?? "scenario"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function copyReceipt(): void {
  if (receiptId.length === 0) {
    return;
  }
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) {
    fail(new Error("이 브라우저에서는 클립보드를 쓸 수 없습니다 — id를 직접 선택해 복사하세요"));
    return;
  }
  void clipboard.writeText(receiptId).then(
    () => {
      copyButton.textContent = "복사됨";
      window.setTimeout(() => {
        copyButton.textContent = "영수증 id 복사";
      }, 1500);
    },
    () => {
      fail(new Error("복사 권한이 없습니다 — id를 직접 선택해 복사하세요"));
    },
  );
}

element<HTMLButtonElement>("restart").addEventListener("click", () => {
  stop();
  playhead = 0;
  scrub.value = "0";
  render();
});
playButton.addEventListener("click", () => {
  if (playHandle === 0) {
    startPlayback();
  } else {
    stop();
  }
});
element<HTMLButtonElement>("next").addEventListener("click", () => {
  stop();
  jump(1);
});
scrub.addEventListener("input", () => {
  stop();
  playhead = Number(scrub.value);
  render();
});
speedSelect.addEventListener("change", () => {
  speed = Number(speedSelect.value);
  if (playHandle !== 0) {
    stop();
    startPlayback();
  }
});
canvas.addEventListener("click", (event) => {
  showEventDetails(event.clientX, event.clientY);
});
element<HTMLButtonElement>("add-step").addEventListener("click", () => {
  addStep();
});
copyButton.addEventListener("click", () => {
  copyReceipt();
});
downloadButton.addEventListener("click", () => {
  downloadScenario();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file === undefined) {
    return;
  }
  void file.text().then((content) => {
    if (utf8Length(content) > MAX_SCENARIO_BYTES) {
      fail(new Error(`시나리오가 ${MAX_SCENARIO_BYTES} 바이트를 넘습니다`));
      return;
    }
    try {
      loadScenario(JSON.parse(content) as unknown);
    } catch (error) {
      fail(error);
    }
  });
});
window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  if (event.key === " ") {
    event.preventDefault();
    if (playHandle === 0) {
      startPlayback();
    } else {
      stop();
    }
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    stop();
    jump(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    stop();
    jump(-1);
  } else if (event.key === "Home") {
    stop();
    playhead = 0;
    scrub.value = "0";
    render();
  } else if (event.key === "End") {
    stop();
    playhead = replay?.span[1] ?? 0;
    scrub.value = String(playhead);
    render();
  }
});

renderStories();
const openingStory = STORIES[0];
if (openingStory !== undefined) {
  selectStory(openingStory, true);
}
