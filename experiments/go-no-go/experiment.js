import {
  buildGoNoGoTrials,
  createGoNoGoCsv,
  createSessionId,
  scoreGoNoGo,
  summarizeGoNoGo,
} from "./logic.mjs";
import { seededRandom } from "../../assets/random.mjs";

const EXPERIMENT_ID = "go-no-go-visual";
const EXPERIMENT_VERSION = "1.1.0";
const Presets = Object.freeze({
  demo: { totalTrials: 30, goPercent: 80, stimulusDuration: 250, responseDeadline: 750, iti: 250 },
  standard: { totalTrials: 100, goPercent: 80, stimulusDuration: 250, responseDeadline: 750, iti: 250 },
  precision: { totalTrials: 200, goPercent: 80, stimulusDuration: 250, responseDeadline: 750, iti: 250 },
});

const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let experimentRunning = false;
let mainPhaseActive = false;
let focusLossCount = 0;
let sessionId = "";
let lastConfig = null;
let lastRows = [];

function readConfig() {
  const data = new FormData(form);
  return {
    preset: data.get("preset"),
    totalTrials: Number(data.get("totalTrials")),
    goPercent: Number(data.get("goPercent")),
    goShape: data.get("goShape"),
    stimulusDuration: Number(data.get("stimulusDuration")),
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
  if (config.stimulusDuration > config.responseDeadline) {
    document.querySelector("#stimulus-duration").setAttribute("aria-invalid", "true");
    document.querySelector("#response-deadline").setAttribute("aria-invalid", "true");
    messages.push("回答できる時間は、刺激の表示時間以上にしてください。");
  }
  const noGoCount = config.totalTrials - Math.round(config.totalTrials * config.goPercent / 100);
  if (noGoCount < 2) messages.push("No-go試行が2回以上になるよう、試行数またはGo刺激の割合を調整してください。");
  return [...new Set(messages)];
}

function shapeLabel(shape) { return shape === "circle" ? "円" : "四角"; }

function updatePreview() {
  const config = readConfig();
  const messages = validateConfig(config);
  errors.textContent = messages.join(" ");
  const goCount = Math.round(config.totalTrials * config.goPercent / 100);
  const noGoCount = config.totalTrials - goCount;
  document.querySelector("#trial-count").textContent = `本試行${config.totalTrials}回`;
  document.querySelector("#condition-counts").textContent = `Go ${goCount} / No-go ${noGoCount}`;
  const seconds = config.totalTrials * (config.responseDeadline + config.iti) / 1000 + 50;
  document.querySelector("#estimated-time").textContent = `約${Math.max(2, Math.ceil(seconds / 60))}分`;
  const noGoShape = config.goShape === "circle" ? "square" : "circle";
  document.querySelector("#go-preview-shape").className = `shape ${config.goShape}`;
  document.querySelector("#no-go-preview-shape").className = `shape ${noGoShape}`;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("#total-trials").value = Presets.demo.totalTrials;
  document.querySelector("#go-percent").value = Presets.demo.goPercent;
  document.querySelector("#go-shape").value = "circle";
  document.querySelector("#stimulus-duration").value = Presets.demo.stimulusDuration;
  document.querySelector("#response-deadline").value = Presets.demo.responseDeadline;
  document.querySelector("#iti").value = Presets.demo.iti;
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const pluginInfo = {
  name: "go-no-go-keyboard",
  version: EXPERIMENT_VERSION,
  parameters: {
    condition: { type: parameterType.STRING, default: undefined },
    stimulus_shape: { type: parameterType.STRING, default: undefined },
    stimulus_duration: { type: parameterType.INT, default: 250 },
    response_deadline: { type: parameterType.INT, default: 750 },
    feedback: { type: parameterType.BOOL, default: false },
    phase_label: { type: parameterType.STRING, default: "本試行" },
    trial_index: { type: parameterType.INT, default: 0 },
    total_trials: { type: parameterType.INT, default: 1 },
  },
  data: {
    response_key: { type: parameterType.STRING },
    response_made: { type: parameterType.INT },
    correctness: { type: parameterType.INT },
    response_outcome: { type: parameterType.STRING },
    rt: { type: parameterType.FLOAT },
  },
};

class GoNoGoKeyboardPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(displayElement, trial) {
    displayElement.innerHTML = `<div class="go-no-go-trial">
      <div class="trial-toolbar"><strong>${trial.phase_label}</strong><span>${trial.trial_index + 1} / ${trial.total_trials}</span></div>
      <div class="go-stage"><span class="shape ${trial.stimulus_shape}" aria-label="${shapeLabel(trial.stimulus_shape)}"></span></div>
      <p class="trial-status" aria-live="polite">GoならSpace、No-goなら何も押さない</p>
    </div>`;

    const stimulus = displayElement.querySelector(".shape");
    const status = displayElement.querySelector(".trial-status");
    let startedAt = null;
    let responseMade = false;
    let rt = null;
    let completed = false;
    let stimulusTimer = null;
    let deadlineTimer = null;

    const finish = () => {
      if (completed) return;
      completed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(stimulusTimer);
      window.clearTimeout(deadlineTimer);
      const outcome = scoreGoNoGo(trial.condition, responseMade);
      const correctness = outcome === "hit" || outcome === "correct-rejection" ? 1 : 0;
      this.jsPsych.finishTrial({
        response_key: responseMade ? "Space" : null,
        response_made: responseMade ? 1 : 0,
        correctness,
        response_outcome: outcome,
        rt,
      });
    };

    const onKeyDown = (event) => {
      if (event.repeat || event.code !== "Space" || responseMade) return;
      event.preventDefault();
      responseMade = true;
      rt = Number((performance.now() - startedAt).toFixed(3));
      if (trial.feedback) status.textContent = trial.condition === "go" ? "正解です。" : "No-goでは押しません。";
    };

    requestAnimationFrame(() => requestAnimationFrame(() => {
      startedAt = performance.now();
      window.addEventListener("keydown", onKeyDown);
      stimulusTimer = window.setTimeout(() => { stimulus.hidden = true; }, trial.stimulus_duration);
      deadlineTimer = window.setTimeout(() => {
        if (trial.feedback && !responseMade) status.textContent = trial.condition === "no-go" ? "正解です。" : "GoではSpaceを押します。";
        if (trial.feedback) window.setTimeout(finish, 350);
        else finish();
      }, trial.response_deadline);
    }));
  }
}
GoNoGoKeyboardPlugin.info = pluginInfo;

function instructionTrial(phase, title, text, extra = "") {
  return {
    type: window.jsPsychHtmlKeyboardResponse,
    stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p>${extra}<p><kbd>Space</kbd> を押すと進みます。</p></div>`,
    choices: [" "],
  };
}

function createTimeline(config, random) {
  const practice = buildGoNoGoTrials({ totalTrials: 8, goPercent: 75, goShape: config.goShape, random });
  const main = buildGoNoGoTrials({ ...config, random });
  const noGoShape = config.goShape === "circle" ? "square" : "circle";
  const makeTrial = (trial, index, phase, total, feedback) => ({
    type: GoNoGoKeyboardPlugin,
    condition: trial.condition,
    stimulus_shape: trial.stimulusShape,
    stimulus_duration: config.stimulusDuration,
    response_deadline: config.responseDeadline,
    feedback,
    phase_label: phase === "practice" ? "操作練習" : "本試行",
    trial_index: index,
    total_trials: total,
    post_trial_gap: phase === "main" ? config.iti : 100,
    data: phase === "main" ? {
      phase,
      experiment_id: EXPERIMENT_ID,
      experiment_version: EXPERIMENT_VERSION,
      session_id: sessionId,
      random_seed: sessionId,
      recorded_at: new Date().toISOString(),
      trial_index: trial.trialIndex,
      condition_trial_index: trial.conditionTrialIndex,
      condition: trial.condition,
      previous_condition: trial.previousCondition,
      condition_run_length: trial.conditionRunLength,
      stimulus_shape: trial.stimulusShape,
      go_shape: config.goShape,
      go_percent: config.goPercent,
      total_trials: config.totalTrials,
      stimulus_duration: config.stimulusDuration,
      response_deadline: config.responseDeadline,
      iti: config.iti,
      preset: config.preset,
    } : { phase },
  });

  return [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    instructionTrial("PRACTICE", "8試行を練習します", `${shapeLabel(config.goShape)}が出たらSpaceキーを1回押し、${shapeLabel(noGoShape)}が出たら何も押しません。`, `<div class="instruction-rule"><span class="shape ${config.goShape}"></span><strong>Space</strong><span class="shape ${noGoShape}"></span><strong>何も押さない</strong></div>`),
    ...practice.map((trial, index) => makeTrial(trial, index, "practice", practice.length, true)),
    {
      ...instructionTrial("MAIN SESSION", `本試行${main.length}回を始めます`, "本試行では正誤を表示しません。できるだけ速く、正確に行ってください。"),
      on_finish: () => { mainPhaseActive = true; },
    },
    ...main.map((trial, index) => makeTrial(trial, index, "main", main.length, false)),
    { type: window.jsPsychHtmlKeyboardResponse, stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>すべての試行が終わりました</h2><p>結果を集計しています。</p></div>', choices: "NO_KEYS", trial_duration: 400, on_start: () => { mainPhaseActive = false; } },
  ];
}

function toExportRows(rawRows, environment) {
  return rawRows.map((row) => ({
    experiment_id: row.experiment_id,
    experiment_version: row.experiment_version,
    session_id: row.session_id,
    random_seed: row.random_seed,
    recorded_at: row.recorded_at,
    trial_index: row.trial_index,
    condition_trial_index: row.condition_trial_index,
    condition: row.condition,
    previous_condition: row.previous_condition,
    condition_run_length: row.condition_run_length,
    stimulus_shape: row.stimulus_shape,
    go_shape: row.go_shape,
    response_key: row.response_key,
    response_made: row.response_made,
    correctness: row.correctness,
    rt: row.rt,
    go_percent: row.go_percent,
    total_trials: row.total_trials,
    stimulus_duration: row.stimulus_duration,
    response_deadline: row.response_deadline,
    iti: row.iti,
    preset: row.preset,
    focus_loss_count: focusLossCount,
    browser: environment.browser,
    os: environment.os,
    viewport_width: environment.width,
    viewport_height: environment.height,
  }));
}

function percent(value) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }

function showResults(jsPsych) {
  experimentRunning = false;
  mainPhaseActive = false;
  runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastRows = toExportRows(jsPsych.data.get().filter({ phase: "main" }).values(), environment);
  const summary = summarizeGoNoGo(lastRows);
  document.querySelector("#commission-rate").textContent = percent(summary.commissionRate);
  document.querySelector("#commission-detail").textContent = `${summary.commissions} / ${summary.noGoCount}試行`;
  document.querySelector("#omission-rate").textContent = percent(summary.omissionRate);
  document.querySelector("#omission-detail").textContent = `${summary.omissions} / ${summary.goCount}試行`;
  document.querySelector("#mean-go-rt").textContent = summary.meanCorrectGoRt === null ? "—" : `${summary.meanCorrectGoRt.toFixed(0)} ms`;
  document.querySelector("#summary-body").innerHTML = `<tr><td>Go</td><td>${summary.goCount}</td><td>${summary.hits}</td><td>${summary.omissions}（見逃し）</td><td>${percent(summary.hitRate)}</td></tr><tr><td>No-go</td><td>${summary.noGoCount}</td><td>${summary.correctRejections}</td><td>${summary.commissions}（誤反応）</td><td>${percent(summary.correctRejectionRate)}</td></tr>`;
  document.querySelector("#focus-summary").textContent = `本試行中のフォーカス喪失：${focusLossCount}回`;
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startExperiment(config) {
  lastConfig = structuredClone(config);
  sessionId = createSessionId();
  focusLossCount = 0;
  mainPhaseActive = false;
  resultsSection.hidden = true;
  setupSections.forEach((section) => { section.hidden = true; });
  runner.hidden = false;
  experimentRunning = true;
  window.scrollTo({ top: 0, behavior: "instant" });
  const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) });
  jsPsych.run(createTimeline(config, seededRandom(sessionId)));
}

function downloadCsv() {
  const blob = new Blob([createGoNoGoCsv(lastRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `go-no-go_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => {
  if (event.target.name === "preset") {
    const preset = Presets[event.target.value];
    document.querySelector("#total-trials").value = preset.totalTrials;
    document.querySelector("#go-percent").value = preset.goPercent;
    document.querySelector("#stimulus-duration").value = preset.stimulusDuration;
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
window.addEventListener("blur", () => { if (mainPhaseActive) focusLossCount += 1; });
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
