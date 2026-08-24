import {
  COLOR_OPTIONS,
  buildStroopTrials,
  createSessionId,
  createStroopCsv,
  summarizeStroop,
} from "./logic.mjs";

const EXPERIMENT_ID = "stroop-manual";
const EXPERIMENT_VERSION = "1.0.0";
const Presets = Object.freeze({
  demo: { trialsPerCondition: 6, responseDeadline: 4000, iti: 250 },
  standard: { trialsPerCondition: 20, responseDeadline: 4000, iti: 250 },
  precision: { trialsPerCondition: 40, responseDeadline: 4000, iti: 250 },
});

const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const trialCount = document.querySelector("#trial-count");
const estimatedTime = document.querySelector("#estimated-time");
const orderSummary = document.querySelector("#order-summary");
const previewWord = document.querySelector("#preview-word");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let experimentRunning = false;
let sessionId = "";
let lastConfig = null;
let lastRows = [];

function keyMapHtml(className = "key-map") {
  return `<ol class="${className}" aria-label="回答キー">${COLOR_OPTIONS.map((color) => `<li><kbd>${color.key}</kbd>${color.label}</li>`).join("")}</ol>`;
}

function readConfig() {
  const data = new FormData(form);
  return {
    preset: data.get("preset"),
    blockOrder: data.get("blockOrder"),
    trialsPerCondition: Number(data.get("trialsPerCondition")),
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
  return [...new Set(messages)];
}

function orderLabel(order) {
  return { "control-first": "統制 → 不一致", "incongruent-first": "不一致 → 統制", mixed: "試行ごとに混合" }[order];
}

function updatePreview() {
  const config = readConfig();
  const messages = validateConfig(config);
  errors.textContent = messages.join(" ");
  trialCount.textContent = `本試行${config.trialsPerCondition * 2}回`;
  estimatedTime.textContent = `約${Math.max(3, Math.ceil(config.trialsPerCondition * 2 * 0.1))}分`;
  orderSummary.textContent = orderLabel(config.blockOrder);
  const sampleInk = COLOR_OPTIONS[0];
  previewWord.textContent = COLOR_OPTIONS[1].label;
  previewWord.style.color = sampleInk.css;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("#block-order").value = "control-first";
  document.querySelector("#trials-per-condition").value = Presets.demo.trialsPerCondition;
  document.querySelector("#response-deadline").value = Presets.demo.responseDeadline;
  document.querySelector("#iti").value = Presets.demo.iti;
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const pluginInfo = {
  name: "stroop-keyboard",
  version: EXPERIMENT_VERSION,
  parameters: {
    stimulus_text: { type: parameterType.STRING, default: undefined },
    ink_css: { type: parameterType.STRING, default: undefined },
    correct_key: { type: parameterType.STRING, default: undefined },
    response_deadline: { type: parameterType.INT, default: 4000 },
    feedback: { type: parameterType.BOOL, default: false },
    phase_label: { type: parameterType.STRING, default: "本試行" },
    trial_index: { type: parameterType.INT, default: 0 },
    total_trials: { type: parameterType.INT, default: 1 },
  },
  data: {
    response_key: { type: parameterType.STRING },
    correct_key: { type: parameterType.STRING },
    correctness: { type: parameterType.INT },
    rt: { type: parameterType.FLOAT },
    timed_out: { type: parameterType.BOOL },
  },
};

class StroopKeyboardPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(displayElement, trial) {
    const progress = Math.round(((trial.trial_index + 1) / trial.total_trials) * 100);
    displayElement.innerHTML = `<div class="stroop-trial">
      <div class="trial-toolbar"><strong>${trial.phase_label}</strong><span>${trial.trial_index + 1} / ${trial.total_trials}</span></div>
      <div class="progress-track" aria-hidden="true"><span style="width:${progress}%"></span></div>
      <div class="stroop-stage"><span class="stroop-word" style="color:${trial.ink_css}">${trial.stimulus_text}</span></div>
      ${keyMapHtml("key-map trial-key-map")}
      <p class="trial-status" aria-live="polite">文字ではなく、インクの色を答えてください。</p>
    </div>`;

    const status = displayElement.querySelector(".trial-status");
    let startedAt = null;
    let timerId = null;
    let finished = false;

    const finish = (responseKey, timedOut) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timerId);
      const rt = responseKey === null ? null : Number((performance.now() - startedAt).toFixed(3));
      const correctness = responseKey === trial.correct_key ? 1 : 0;
      const data = { response_key: responseKey, correct_key: trial.correct_key, correctness, rt, timed_out: timedOut };
      if (!trial.feedback) {
        this.jsPsych.finishTrial(data);
        return;
      }
      status.textContent = timedOut ? "時間切れです。" : correctness === 1 ? "正解です。" : `不正解です。正解は${trial.correct_key}キーです。`;
      window.setTimeout(() => this.jsPsych.finishTrial(data), 500);
    };

    const onKeyDown = (event) => {
      if (event.repeat || !COLOR_OPTIONS.some((color) => color.key === event.key)) return;
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
StroopKeyboardPlugin.info = pluginInfo;

function instructionTrial(phase, title, text) {
  return {
    type: window.jsPsychHtmlKeyboardResponse,
    stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p><div class="key-guide">${COLOR_OPTIONS.map((color) => `<kbd>${color.key}</kbd> ${color.label}`).join("　")}</div><p><kbd>Space</kbd> を押すと進みます。</p></div>`,
    choices: [" "],
  };
}

function createTimeline(config) {
  const practice = buildStroopTrials({ trialsPerCondition: 2, blockOrder: "mixed" });
  const main = buildStroopTrials(config);
  const makeTrial = (trial, index, phase, total, feedback) => ({
    type: StroopKeyboardPlugin,
    stimulus_text: trial.stimulusText,
    ink_css: trial.inkCss,
    correct_key: trial.correctKey,
    response_deadline: config.responseDeadline,
    feedback,
    phase_label: phase === "practice" ? "操作練習" : "本試行",
    trial_index: index,
    total_trials: total,
    post_trial_gap: phase === "main" ? config.iti : 0,
    data: phase === "main" ? {
      phase,
      experiment_id: EXPERIMENT_ID,
      experiment_version: EXPERIMENT_VERSION,
      session_id: sessionId,
      recorded_at: new Date().toISOString(),
      trial_index: trial.trialIndex,
      condition_trial_index: trial.conditionTrialIndex,
      condition: trial.condition,
      stimulus_text: trial.stimulusText,
      ink_color: trial.inkColor,
      block_order: config.blockOrder,
      trials_per_condition: config.trialsPerCondition,
      response_deadline: config.responseDeadline,
      iti: config.iti,
    } : { phase },
  });

  return [
    {
      type: window.jsPsychBrowserCheck,
      features: ["width", "height", "browser", "browser_version", "mobile", "os"],
      data: { phase: "environment" },
    },
    instructionTrial("PRACTICE", "まず4試行を練習します", "画面の文字が表す色ではなく、インクの色に対応する数字キーを押してください。練習では正誤を表示します。"),
    ...practice.map((trial, index) => makeTrial(trial, index, "practice", practice.length, true)),
    instructionTrial("MAIN SESSION", `本試行${main.length}回を始めます`, "本試行では正誤を表示しません。できるだけ速く、正確に回答してください。"),
    ...main.map((trial, index) => makeTrial(trial, index, "main", main.length, false)),
    { type: window.jsPsychHtmlKeyboardResponse, stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>すべての試行が終わりました</h2><p>結果を集計しています。</p></div>', choices: "NO_KEYS", trial_duration: 400 },
  ];
}

function toExportRows(rawRows, environment) {
  return rawRows.map((row) => ({
    experiment_id: row.experiment_id,
    experiment_version: row.experiment_version,
    session_id: row.session_id,
    recorded_at: row.recorded_at,
    trial_index: row.trial_index,
    condition_trial_index: row.condition_trial_index,
    condition: row.condition,
    stimulus_text: row.stimulus_text,
    ink_color: row.ink_color,
    correct_key: row.correct_key,
    response_key: row.response_key,
    correctness: row.correctness,
    rt: row.rt,
    timed_out: row.timed_out,
    block_order: row.block_order,
    trials_per_condition: row.trials_per_condition,
    response_deadline: row.response_deadline,
    iti: row.iti,
    browser: environment.browser,
    os: environment.os,
    viewport_width: environment.width,
    viewport_height: environment.height,
  }));
}

function conditionLabel(condition) { return condition === "control" ? "統制" : "不一致"; }

function drawRtChart(summary) {
  const values = summary.conditions.map((item) => item.meanCorrectRt || 0);
  const max = Math.max(...values, 1);
  document.querySelector("#rt-chart").innerHTML = summary.conditions.map((item) => {
    const height = item.meanCorrectRt === null ? 4 : Math.max(4, Math.round((item.meanCorrectRt / max) * 190));
    const value = item.meanCorrectRt === null ? "算出不可" : `${item.meanCorrectRt.toFixed(0)} ms`;
    return `<div class="rt-bar-item"><span class="rt-value">${value}</span><span class="rt-bar" style="height:${height}px"></span><span class="rt-label">${conditionLabel(item.condition)}</span></div>`;
  }).join("");
}

function showResults(jsPsych) {
  experimentRunning = false;
  runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastRows = toExportRows(jsPsych.data.get().filter({ phase: "main" }).values(), environment);
  const summary = summarizeStroop(lastRows);
  document.querySelector("#summary-body").innerHTML = summary.conditions.map((item) => `<tr><td>${conditionLabel(item.condition)}</td><td>${item.count}</td><td>${item.accuracy === null ? "—" : `${(item.accuracy * 100).toFixed(1)}%`}</td><td>${item.meanCorrectRt === null ? "—" : `${item.meanCorrectRt.toFixed(0)} ms`}</td></tr>`).join("");
  document.querySelector("#interference-summary").textContent = summary.interferenceMs === null
    ? "反応時間による干渉量は、各条件に正答試行がないため算出できません。"
    : `反応時間による干渉量：${summary.interferenceMs >= 0 ? "+" : ""}${summary.interferenceMs.toFixed(0)} ms（不一致 − 統制）`;
  drawRtChart(summary);
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
  const blob = new Blob([createStroopCsv(lastRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stroop_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => {
  if (event.target.name === "preset") {
    const preset = Presets[event.target.value];
    document.querySelector("#trials-per-condition").value = preset.trialsPerCondition;
    document.querySelector("#response-deadline").value = preset.responseDeadline;
    document.querySelector("#iti").value = preset.iti;
  }
  updatePreview();
});
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const config = readConfig();
  const messages = validateConfig(config);
  errors.textContent = messages.join(" ");
  if (messages.length === 0) startExperiment(config);
});
document.querySelector("#download-csv").addEventListener("click", downloadCsv);
document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig));
document.querySelector("#change-settings").addEventListener("click", () => {
  resultsSection.hidden = true;
  setupSections.forEach((section) => { section.hidden = false; });
  document.querySelector("#setup").scrollIntoView({ behavior: "smooth" });
});
window.addEventListener("beforeunload", (event) => {
  if (!experimentRunning) return;
  event.preventDefault();
  event.returnValue = "";
});

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(max-width: 700px) and (pointer: coarse)").matches;
if (isMobile) {
  document.querySelector("#device-warning").hidden = false;
  document.querySelector("#start-experiment").disabled = true;
}

updatePreview();
