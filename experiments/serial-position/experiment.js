import {
  buildSerialLists,
  createSerialCsv,
  createSessionId,
  scoreRecall,
  summarizeSerialPosition,
} from "./logic.mjs";

const EXPERIMENT_ID = "serial-position-free-recall";
const EXPERIMENT_VERSION = "1.0.0";
const Presets = Object.freeze({
  demo: { listLength: 10, listCount: 2, stimulusDuration: 1200, intervalDuration: 500, recallDeadline: 45 },
  standard: { listLength: 10, listCount: 4, stimulusDuration: 3000, intervalDuration: 1000, recallDeadline: 60 },
  long: { listLength: 15, listCount: 4, stimulusDuration: 2500, intervalDuration: 750, recallDeadline: 75 },
});
const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let experimentRunning = false;
let sessionId = "";
let lastConfig = null;
let lastLists = [];
let lastRows = [];

function readConfig() {
  const data = new FormData(form);
  return {
    preset: data.get("preset"), listLength: Number(data.get("listLength")), listCount: Number(data.get("listCount")),
    stimulusDuration: Number(data.get("stimulusDuration")), intervalDuration: Number(data.get("intervalDuration")),
    recallDeadline: Number(data.get("recallDeadline")),
  };
}

function validateConfig(config) {
  const messages = [];
  for (const input of form.querySelectorAll("input[type='number']")) {
    const value = Number(input.value);
    const invalid = !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max);
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid) messages.push(`${input.closest("label").firstChild.textContent.trim()}を範囲内で入力してください。`);
  }
  return [...new Set(messages)];
}

function updatePreview() {
  const config = readConfig();
  errors.textContent = validateConfig(config).join(" ");
  document.querySelector("#trial-count").textContent = `全${config.listLength * config.listCount}項目`;
  document.querySelector("#condition-summary").textContent = `${config.listLength}項目 × ${config.listCount}リスト`;
  const secondsPerList = config.listLength * (config.stimulusDuration + config.intervalDuration) / 1000 + config.recallDeadline;
  document.querySelector("#estimated-time").textContent = `約${Math.max(2, Math.ceil(secondsPerList * config.listCount / 60))}分`;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  for (const [key, value] of Object.entries(Presets.demo)) document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).value = value;
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const recallPluginInfo = {
  name: "free-recall-text",
  version: EXPERIMENT_VERSION,
  parameters: {
    list_index: { type: parameterType.INT, default: 1 }, total_lists: { type: parameterType.INT, default: 1 },
    recall_deadline: { type: parameterType.INT, default: 45 },
  },
  data: { response_text: { type: parameterType.STRING }, recall_rt: { type: parameterType.FLOAT }, timed_out: { type: parameterType.BOOL } },
};

class FreeRecallPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }
  trial(displayElement, trial) {
    displayElement.innerHTML = `<div class="recall-screen"><p class="eyebrow">FREE RECALL ${trial.list_index} / ${trial.total_lists}</p><h2>思い出せるつづりを入力してください</h2><p>順序は問いません。空白、読点、または改行で区切ってください。</p><textarea aria-label="思い出したつづり" autocomplete="off" spellcheck="false"></textarea><div class="recall-toolbar"><span class="recall-timer" aria-live="polite">残り${trial.recall_deadline}秒</span><button type="button" class="button primary">入力を確定する</button></div></div>`;
    const textarea = displayElement.querySelector("textarea");
    const button = displayElement.querySelector("button");
    const timerLabel = displayElement.querySelector(".recall-timer");
    const startedAt = performance.now();
    let finished = false;
    let remaining = trial.recall_deadline;
    const finish = (timedOut) => {
      if (finished) return;
      finished = true;
      window.clearInterval(intervalId);
      this.jsPsych.finishTrial({ response_text: textarea.value, recall_rt: Number((performance.now() - startedAt).toFixed(3)), timed_out: timedOut });
    };
    button.addEventListener("click", () => finish(false));
    const intervalId = window.setInterval(() => {
      remaining -= 1;
      timerLabel.textContent = `残り${Math.max(0, remaining)}秒`;
      if (remaining <= 0) finish(true);
    }, 1000);
    requestAnimationFrame(() => textarea.focus());
  }
}
FreeRecallPlugin.info = recallPluginInfo;

function instructionTrial(phase, title, text) {
  return { type: window.jsPsychHtmlKeyboardResponse, stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p><p><kbd>Space</kbd> を押すと進みます。</p></div>`, choices: [" "] };
}

function createTimeline(config, lists) {
  const timeline = [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    instructionTrial("INSTRUCTIONS", "逐次提示されたつづりを覚えます", "各リストの提示直後に、思い出せたつづりを自由な順序で入力します。提示中はメモを取らないでください。"),
  ];
  for (const list of lists) {
    timeline.push(instructionTrial("MEMORY LIST", `リスト ${list.listIndex} / ${lists.length}`, "準備ができたら開始してください。"));
    for (const entry of list.items) {
      timeline.push({
        type: window.jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="serial-word-screen"><span class="serial-progress">リスト${list.listIndex}　${entry.serialPosition}/${config.listLength}</span><span class="serial-word">${entry.item}</span></div>`,
        choices: "NO_KEYS", trial_duration: config.stimulusDuration, post_trial_gap: config.intervalDuration,
        data: { phase: "presentation", list_index: list.listIndex, serial_position: entry.serialPosition, item: entry.item },
      });
    }
    timeline.push({ type: FreeRecallPlugin, list_index: list.listIndex, total_lists: lists.length, recall_deadline: config.recallDeadline, data: { phase: "recall", list_index: list.listIndex } });
  }
  timeline.push({ type: window.jsPsychHtmlKeyboardResponse, stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>すべてのリストが終わりました</h2><p>結果を集計しています。</p></div>', choices: "NO_KEYS", trial_duration: 400 });
  return timeline;
}

function toExportRows(recallTrials, environment) {
  const recordedAt = new Date().toISOString();
  return lastLists.flatMap((list) => {
    const recallTrial = recallTrials.find((trial) => Number(trial.list_index) === list.listIndex) || {};
    return scoreRecall(list, recallTrial.response_text).map((score) => ({
      experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION, session_id: sessionId, recorded_at: recordedAt,
      list_index: score.listIndex, serial_position: score.serialPosition, item: score.item, recalled: score.recalled,
      recall_order: score.recallOrder, response_count: score.responseCount, recall_rt: recallTrial.recall_rt,
      list_length: lastConfig.listLength, list_count: lastConfig.listCount, stimulus_duration: lastConfig.stimulusDuration,
      interval_duration: lastConfig.intervalDuration, recall_deadline: lastConfig.recallDeadline,
      browser: environment.browser, os: environment.os, viewport_width: environment.width, viewport_height: environment.height,
    }));
  });
}

function drawSerialChart(summary) {
  const canvas = document.querySelector("#serial-chart");
  const context = canvas.getContext("2d");
  const padding = { top: 30, right: 24, bottom: 55, left: 58 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const x = (position) => padding.left + ((position - 1) / Math.max(1, summary.curve.length - 1)) * width;
  const y = (rate) => padding.top + height - rate * height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "13px sans-serif"; context.fillStyle = "#5f6b65"; context.textAlign = "right";
  for (let rate = 0; rate <= 1.001; rate += .25) { context.beginPath(); context.moveTo(padding.left, y(rate)); context.lineTo(canvas.width - padding.right, y(rate)); context.strokeStyle = "#d5d9d3"; context.stroke(); context.fillText(`${Math.round(rate * 100)}%`, padding.left - 8, y(rate) + 4); }
  context.beginPath(); context.strokeStyle = "#315c45"; context.lineWidth = 3;
  summary.curve.forEach((point, index) => { if (index === 0) context.moveTo(x(point.position), y(point.recallRate)); else context.lineTo(x(point.position), y(point.recallRate)); });
  context.stroke();
  for (const point of summary.curve) { context.beginPath(); context.arc(x(point.position), y(point.recallRate), 5, 0, Math.PI * 2); context.fillStyle = "#315c45"; context.fill(); context.fillStyle = "#17221d"; context.textAlign = "center"; context.fillText(String(point.position), x(point.position), canvas.height - 28); }
  context.fillText("系列位置", padding.left + width / 2, canvas.height - 7);
}

function showResults(jsPsych) {
  experimentRunning = false;
  runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastRows = toExportRows(jsPsych.data.get().filter({ phase: "recall" }).values(), environment);
  const summary = summarizeSerialPosition(lastRows);
  drawSerialChart(summary);
  const labels = { primacy: "初頭部", middle: "中央部", recency: "新近部" };
  document.querySelector("#zone-summary").innerHTML = summary.zones.map((zone) => `<div class="zone-card"><strong>${labels[zone.zone]}</strong><span>${zone.recallRate === null ? "—" : `${(zone.recallRate * 100).toFixed(1)}%`}</span><small>位置 ${zone.positions.join("・")}</small></div>`).join("");
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startExperiment(config) {
  lastConfig = structuredClone(config); sessionId = createSessionId(); lastLists = buildSerialLists(config);
  resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = true; }); runner.hidden = false; experimentRunning = true;
  window.scrollTo({ top: 0, behavior: "instant" });
  const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) });
  jsPsych.run(createTimeline(config, lastLists));
}

function downloadCsv() {
  const blob = new Blob([createSerialCsv(lastRows)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `serial-position_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => { if (event.target.name === "preset") { const preset = Presets[event.target.value]; for (const [key, value] of Object.entries(preset)) document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).value = value; } updatePreview(); });
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => { event.preventDefault(); const config = readConfig(); const messages = validateConfig(config); errors.textContent = messages.join(" "); if (messages.length === 0) startExperiment(config); });
document.querySelector("#download-csv").addEventListener("click", downloadCsv);
document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig));
document.querySelector("#change-settings").addEventListener("click", () => { resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = false; }); document.querySelector("#setup").scrollIntoView({ behavior: "smooth" }); });
window.addEventListener("beforeunload", (event) => { if (!experimentRunning) return; event.preventDefault(); event.returnValue = ""; });
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(max-width: 700px) and (pointer: coarse)").matches;
if (isMobile) { document.querySelector("#device-warning").hidden = false; document.querySelector("#start-experiment").disabled = true; }
updatePreview();
