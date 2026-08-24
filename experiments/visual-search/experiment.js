import {
  buildSearchTrials,
  buildStimulusItems,
  createSearchCsv,
  createSessionId,
  summarizeSearch,
} from "./logic.mjs";

const EXPERIMENT_ID = "visual-search";
const EXPERIMENT_VERSION = "1.0.0";
const CANVAS_SIZE = 600;
const Presets = Object.freeze({ demo: 1, standard: 5, precision: 10 });
const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let sessionId = "";
let experimentRunning = false;
let lastConfig = null;
let lastRows = [];

function prepareCanvas(canvas, width = CANVAS_SIZE, height = CANVAS_SIZE) {
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.dataset.logicalWidth = String(width);
  canvas.dataset.logicalHeight = String(height);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function drawSearchStimulus(context, items) {
  context.fillStyle = "#111111";
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.lineWidth = 5;
  context.lineCap = "round";
  const cellSize = CANVAS_SIZE / 6;
  const half = 18;
  for (const item of items) {
    const column = item.position % 6;
    const row = Math.floor(item.position / 6);
    const x = (column + .5) * cellSize;
    const y = (row + .5) * cellSize;
    context.strokeStyle = item.color === "red" ? "#ff5555" : "#49d36c";
    context.beginPath();
    if (item.orientation === "descending") {
      context.moveTo(x - half, y - half);
      context.lineTo(x + half, y + half);
    } else {
      context.moveTo(x - half, y + half);
      context.lineTo(x + half, y - half);
    }
    context.stroke();
  }
}

function readConfig() {
  const data = new FormData(form);
  const typeValue = data.get("searchTypes");
  return {
    preset: data.get("preset"),
    searchTypes: typeValue === "both" ? ["feature", "conjunction"] : [typeValue],
    setSizes: [...form.querySelectorAll("input[name='setSize']:checked")].map((input) => Number(input.value)).sort((a, b) => a - b),
    repetitions: Number(data.get("repetitions")),
    responseDeadline: Number(data.get("responseDeadline")),
    iti: Number(data.get("iti")),
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
  if (config.setSizes.length < 2) messages.push("傾きを比較するため、セットサイズを2つ以上選択してください。");
  return [...new Set(messages)];
}

function updatePreview() {
  const config = readConfig();
  const messages = validateConfig(config);
  errors.textContent = messages.join(" ");
  const total = config.searchTypes.length * config.setSizes.length * 2 * config.repetitions;
  document.querySelector("#trial-count").textContent = `本試行${total}回`;
  document.querySelector("#estimated-time").textContent = `約${Math.max(3, Math.ceil(total * .08))}分`;
  document.querySelector("#condition-summary").textContent = `${config.searchTypes.length}探索 × ${config.setSizes.length}サイズ × 有無`;
  const canvas = document.querySelector("#search-preview");
  const context = prepareCanvas(canvas);
  drawSearchStimulus(context, buildStimulusItems({ searchType: "conjunction", setSize: 16, targetPresent: true }));
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("#search-types").value = "both";
  document.querySelector("#repetitions").value = 1;
  document.querySelector("#response-deadline").value = 6000;
  document.querySelector("#iti").value = 500;
  form.querySelectorAll("input[name='setSize']").forEach((input) => { input.checked = true; });
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const pluginInfo = {
  name: "visual-search-canvas",
  version: EXPERIMENT_VERSION,
  parameters: {
    items: { type: parameterType.OBJECT, default: undefined },
    correct_response: { type: parameterType.STRING, default: undefined },
    response_deadline: { type: parameterType.INT, default: 6000 },
    feedback: { type: parameterType.BOOL, default: false },
    phase_label: { type: parameterType.STRING, default: "本試行" },
    trial_index: { type: parameterType.INT, default: 0 },
    total_trials: { type: parameterType.INT, default: 1 },
  },
  data: {
    response_key: { type: parameterType.STRING }, correct_response: { type: parameterType.STRING },
    correctness: { type: parameterType.INT }, rt: { type: parameterType.FLOAT }, timed_out: { type: parameterType.BOOL },
  },
};

class VisualSearchPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }
  trial(displayElement, trial) {
    const progress = Math.round(((trial.trial_index + 1) / trial.total_trials) * 100);
    displayElement.innerHTML = `<div class="search-trial"><div class="trial-toolbar"><strong>${trial.phase_label}</strong><span>${trial.trial_index + 1} / ${trial.total_trials}</span></div><div class="progress-track" aria-hidden="true"><span style="width:${progress}%"></span></div><div class="search-canvas-wrap"><canvas aria-label="赤い右下がり線を探す視覚探索刺激"></canvas></div><div class="search-controls"><span><kbd>→</kbd> ターゲットあり</span><span><kbd>←</kbd> ターゲットなし</span></div><p class="trial-status" aria-live="polite"></p></div>`;
    const canvas = displayElement.querySelector("canvas");
    drawSearchStimulus(prepareCanvas(canvas), trial.items);
    const status = displayElement.querySelector(".trial-status");
    let startedAt = null;
    let timerId = null;
    let finished = false;
    const finish = (responseKey, timedOut) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timerId);
      const correctness = responseKey === trial.correct_response ? 1 : 0;
      const data = { response_key: responseKey, correct_response: trial.correct_response, correctness, rt: responseKey === null ? null : Number((performance.now() - startedAt).toFixed(3)), timed_out: timedOut };
      if (!trial.feedback) { this.jsPsych.finishTrial(data); return; }
      status.textContent = timedOut ? "時間切れです。" : correctness === 1 ? "正解です。" : "不正解です。";
      window.setTimeout(() => this.jsPsych.finishTrial(data), 450);
    };
    const onKeyDown = (event) => {
      if (event.repeat || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      finish(event.key, false);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      startedAt = performance.now();
      window.addEventListener("keydown", onKeyDown);
      timerId = window.setTimeout(() => finish(null, true), trial.response_deadline);
    }));
  }
}
VisualSearchPlugin.info = pluginInfo;

function instructionTrial(phase, title, text) {
  return { type: window.jsPsychHtmlKeyboardResponse, stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p><div class="key-guide"><kbd>→</kbd> あり　 <kbd>←</kbd> なし</div><p><kbd>Space</kbd> を押すと進みます。</p></div>`, choices: [" "] };
}

function createTimeline(config) {
  const practiceConfig = { searchTypes: config.searchTypes, setSizes: [8], repetitions: 1 };
  const practice = buildSearchTrials(practiceConfig);
  const main = buildSearchTrials(config);
  const makeTrial = (trial, index, phase, total, feedback) => ({
    type: VisualSearchPlugin,
    items: buildStimulusItems(trial),
    correct_response: trial.targetPresent ? "ArrowRight" : "ArrowLeft",
    response_deadline: config.responseDeadline,
    feedback,
    phase_label: phase === "practice" ? "操作練習" : "本試行",
    trial_index: index,
    total_trials: total,
    post_trial_gap: phase === "main" ? config.iti : 0,
    data: phase === "main" ? {
      phase, experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION, session_id: sessionId,
      recorded_at: new Date().toISOString(), trial_index: trial.trialIndex, search_type: trial.searchType,
      set_size: trial.setSize, target_present: trial.targetPresent, repetitions: config.repetitions,
      response_deadline: config.responseDeadline, iti: config.iti,
    } : { phase },
  });
  return [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    instructionTrial("PRACTICE", `まず${practice.length}試行を練習します`, "赤い右下がり線があれば右矢印、なければ左矢印を押してください。練習では正誤を表示します。"),
    ...practice.map((trial, index) => makeTrial(trial, index, "practice", practice.length, true)),
    instructionTrial("MAIN SESSION", `本試行${main.length}回を始めます`, "本試行では正誤を表示しません。できるだけ速く、正確に回答してください。"),
    ...main.map((trial, index) => makeTrial(trial, index, "main", main.length, false)),
    { type: window.jsPsychHtmlKeyboardResponse, stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>すべての試行が終わりました</h2><p>結果を集計しています。</p></div>', choices: "NO_KEYS", trial_duration: 400 },
  ];
}

function toExportRows(rawRows, environment) {
  return rawRows.map((row) => ({
    experiment_id: row.experiment_id, experiment_version: row.experiment_version, session_id: row.session_id,
    recorded_at: row.recorded_at, trial_index: row.trial_index, search_type: row.search_type, set_size: row.set_size,
    target_present: row.target_present, correct_response: row.correct_response, response_key: row.response_key,
    correctness: row.correctness, rt: row.rt, timed_out: row.timed_out, repetitions: row.repetitions,
    response_deadline: row.response_deadline, iti: row.iti, browser: environment.browser, os: environment.os,
    viewport_width: environment.width, viewport_height: environment.height,
  }));
}

function typeLabel(type) { return type === "feature" ? "特徴探索" : "結合探索"; }
function targetLabel(present) { return present ? "あり" : "なし"; }

function drawResultChart(summary) {
  const canvas = document.querySelector("#search-chart");
  const context = canvas.getContext("2d");
  const padding = { top: 34, right: 24, bottom: 58, left: 64 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const values = summary.cells.map((cell) => cell.meanCorrectRt).filter((value) => value !== null);
  const max = Math.max(1000, Math.ceil(Math.max(...values, 1) / 500) * 500);
  const y = (value) => padding.top + height - (value / max) * height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "13px sans-serif";
  context.fillStyle = "#5f6b65";
  context.textAlign = "right";
  for (let value = 0; value <= max; value += 500) {
    context.beginPath(); context.moveTo(padding.left, y(value)); context.lineTo(canvas.width - padding.right, y(value));
    context.strokeStyle = "#d5d9d3"; context.stroke(); context.fillText(String(value), padding.left - 8, y(value) + 4);
  }
  const x = (size) => padding.left + ((size - summary.setSizes[0]) / Math.max(1, summary.setSizes.at(-1) - summary.setSizes[0])) * width;
  const styles = { "feature-true": "#315c45", "feature-false": "#7b9f8b", "conjunction-true": "#b44b3f", "conjunction-false": "#c89445" };
  for (const searchType of summary.searchTypes) {
    for (const targetPresent of [true, false]) {
      const cells = summary.cells.filter((cell) => cell.searchType === searchType && cell.targetPresent === targetPresent && cell.meanCorrectRt !== null);
      context.beginPath(); context.strokeStyle = styles[`${searchType}-${targetPresent}`]; context.lineWidth = 3;
      context.setLineDash(targetPresent ? [] : [7, 5]);
      cells.forEach((cell, index) => { if (index === 0) context.moveTo(x(cell.setSize), y(cell.meanCorrectRt)); else context.lineTo(x(cell.setSize), y(cell.meanCorrectRt)); });
      context.stroke(); context.setLineDash([]);
      for (const cell of cells) { context.beginPath(); context.arc(x(cell.setSize), y(cell.meanCorrectRt), 5, 0, Math.PI * 2); context.fillStyle = styles[`${searchType}-${targetPresent}`]; context.fill(); }
    }
  }
  context.fillStyle = "#17221d"; context.textAlign = "center";
  for (const size of summary.setSizes) context.fillText(String(size), x(size), canvas.height - 32);
  context.fillText("セットサイズ", padding.left + width / 2, canvas.height - 8);
}

function showResults(jsPsych) {
  experimentRunning = false;
  runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastRows = toExportRows(jsPsych.data.get().filter({ phase: "main" }).values(), environment);
  const summary = summarizeSearch(lastRows);
  document.querySelector("#slope-body").innerHTML = summary.slopes.map((item) => {
    const rows = lastRows.filter((row) => row.search_type === item.searchType && String(row.target_present) === String(item.targetPresent));
    const accuracy = rows.length === 0 ? null : rows.filter((row) => Number(row.correctness) === 1).length / rows.length;
    return `<tr><td>${typeLabel(item.searchType)}</td><td>${targetLabel(item.targetPresent)}</td><td>${item.slope === null ? "—" : `${item.slope.toFixed(1)} ms/項目`}</td><td>${accuracy === null ? "—" : `${(accuracy * 100).toFixed(1)}%`}</td></tr>`;
  }).join("");
  drawResultChart(summary);
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startExperiment(config) {
  lastConfig = structuredClone(config);
  sessionId = createSessionId();
  resultsSection.hidden = true;
  setupSections.forEach((section) => { section.hidden = true; });
  runner.hidden = false;
  experimentRunning = true;
  window.scrollTo({ top: 0, behavior: "instant" });
  const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) });
  jsPsych.run(createTimeline(config));
}

function downloadCsv() {
  const blob = new Blob([createSearchCsv(lastRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url;
  link.download = `visual-search_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`;
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => {
  if (event.target.name === "preset") document.querySelector("#repetitions").value = Presets[event.target.value];
  updatePreview();
});
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => { event.preventDefault(); const config = readConfig(); const messages = validateConfig(config); errors.textContent = messages.join(" "); if (messages.length === 0) startExperiment(config); });
document.querySelector("#download-csv").addEventListener("click", downloadCsv);
document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig));
document.querySelector("#change-settings").addEventListener("click", () => { resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = false; }); document.querySelector("#setup").scrollIntoView({ behavior: "smooth" }); });
window.addEventListener("beforeunload", (event) => { if (!experimentRunning) return; event.preventDefault(); event.returnValue = ""; });
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(max-width: 700px) and (pointer: coarse)").matches;
if (isMobile) { document.querySelector("#device-warning").hidden = false; document.querySelector("#start-experiment").disabled = true; }
updatePreview();
