import {
  canonicalSolutionPath,
  createNineDotCsv,
  createNineDots,
  createSessionId,
  evaluateNineDotPath,
} from "./logic.mjs";

const EXPERIMENT_ID = "nine-dot-problem";
const EXPERIMENT_VERSION = "1.1.0";
const Presets = Object.freeze({ demo: { maxAttempts: 3, timeLimit: 120 }, standard: { maxAttempts: 5, timeLimit: 300 }, extended: { maxAttempts: 8, timeLimit: 600 } });
const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let experimentRunning = false;
let sessionId = "";
let lastConfig = null;
let lastResult = null;
let lastRows = [];

function readConfig() {
  const data = new FormData(form);
  return { preset: String(data.get("preset")), maxAttempts: Number(data.get("maxAttempts")), timeLimit: Number(data.get("timeLimit")), priorFamiliarity: String(data.get("priorFamiliarity")) };
}

function validateConfig(config) {
  const messages = [];
  for (const input of form.querySelectorAll("input[type='number']")) {
    const value = Number(input.value); const invalid = !Number.isInteger(value) || value < Number(input.min) || value > Number(input.max);
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid) messages.push(`${input.closest("label").firstChild.textContent.trim()}を範囲内の整数で入力してください。`);
  }
  return [...new Set(messages)];
}

function updatePreview() {
  const config = readConfig(); errors.textContent = validateConfig(config).join(" ");
  document.querySelector("#attempt-limit").textContent = `${config.maxAttempts}回まで`;
  document.querySelector("#estimated-time").textContent = `最大${Math.ceil(config.timeLimit / 60)}分`;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("input[name='priorFamiliarity'][value='unknown']").checked = true;
  for (const [key, value] of Object.entries(Presets.demo)) document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).value = value;
  updatePreview();
}

function drawBoard(canvas, path = [], previewPoint = null, covered = []) {
  const context = canvas.getContext("2d"); const dots = createNineDots();
  context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#f5f3e9"; context.fillRect(0, 0, canvas.width, canvas.height);
  if (path.length > 1) { context.beginPath(); context.moveTo(path[0].x, path[0].y); for (const point of path.slice(1)) context.lineTo(point.x, point.y); context.strokeStyle = "#315c45"; context.lineWidth = 5; context.lineCap = "round"; context.lineJoin = "round"; context.stroke(); }
  if (previewPoint && path.length > 0 && path.length < 5) { context.beginPath(); context.moveTo(path.at(-1).x, path.at(-1).y); context.lineTo(previewPoint.x, previewPoint.y); context.strokeStyle = "#7c927f"; context.lineWidth = 3; context.setLineDash([8, 8]); context.stroke(); context.setLineDash([]); }
  dots.forEach((dot, index) => { context.beginPath(); context.arc(dot.x, dot.y, covered[index] ? 11 : 9, 0, Math.PI * 2); context.fillStyle = covered[index] ? "#c7dc4c" : "#17221d"; context.fill(); context.strokeStyle = "#17221d"; context.lineWidth = 2; context.stroke(); });
}

const parameterType = window.jsPsychModule.ParameterType;
const nineDotInfo = {
  name: "nine-dot-drawing", version: EXPERIMENT_VERSION,
  parameters: { max_attempts: { type: parameterType.INT, default: 3 }, time_limit: { type: parameterType.INT, default: 120 } },
  data: { attempts_json: { type: parameterType.STRING }, success: { type: parameterType.BOOL }, total_rt: { type: parameterType.FLOAT }, insight_rating: { type: parameterType.INT } },
};

class NineDotPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(displayElement, trial) {
    const attempts = []; let path = []; let previewPoint = null; let finished = false;
    const startedAt = performance.now(); let attemptStartedAt = startedAt; let timerId;

    const canvasPoint = (canvas, event) => { const rect = canvas.getBoundingClientRect(); return { x: Math.round((event.clientX - rect.left) * canvas.width / rect.width), y: Math.round((event.clientY - rect.top) * canvas.height / rect.height) }; };
    const remainingSeconds = () => Math.max(0, Math.ceil(trial.time_limit - (performance.now() - startedAt) / 1000));

    const recordAttempt = (timedOut = false) => {
      const evaluation = evaluateNineDotPath(path);
      const record = { index: attempts.length + 1, path: path.map((point) => ({ ...point })), ...evaluation, timedOut, attemptRt: Number((performance.now() - attemptStartedAt).toFixed(3)) };
      delete record.covered; attempts.push(record); return record;
    };

    const renderTask = (message = "") => {
      displayElement.innerHTML = `<div class="nine-task"><div class="task-progress"><span>試行 ${Math.min(attempts.length + 1, trial.max_attempts)} / ${trial.max_attempts}</span><span class="time-remaining">残り ${remainingSeconds()} 秒</span></div><h2>9つの点を4本の直線で結ぶ</h2><p>最初に始点をクリックし、その後は線の終点を順にクリックしてください。線はつながったままになり、4本まで引けます。</p><canvas class="nine-canvas" width="640" height="500" aria-label="3行3列に並んだ9つの点。クリックして連続線を引きます"></canvas><div class="drawing-status" aria-live="polite"><span class="segment-status">始点を選んでください</span><span class="coverage-status">通過した点 0 / 9</span></div><p class="task-feedback" role="status" aria-live="polite"></p><div class="drawing-actions"><button type="button" class="button quiet undo-line">1手戻す</button><button type="button" class="button quiet clear-path">描き直す</button><button type="button" class="button primary submit-path">この解答を確定する</button></div></div>`;
      const canvas = displayElement.querySelector("canvas"); const feedback = displayElement.querySelector(".task-feedback"); feedback.textContent = message;
      const updateDrawing = () => {
        const evaluation = evaluateNineDotPath(path); drawBoard(canvas, path, previewPoint, evaluation.covered);
        displayElement.querySelector(".segment-status").textContent = path.length === 0 ? "始点を選んでください" : `線分 ${Math.max(0, path.length - 1)} / 4`;
        displayElement.querySelector(".coverage-status").textContent = `通過した点 ${evaluation.coveredDots} / 9`;
        displayElement.querySelector(".submit-path").disabled = path.length !== 5;
        displayElement.querySelector(".undo-line").disabled = path.length === 0;
        displayElement.querySelector(".clear-path").disabled = path.length === 0;
      };
      canvas.addEventListener("pointermove", (event) => { previewPoint = canvasPoint(canvas, event); updateDrawing(); });
      canvas.addEventListener("pointerleave", () => { previewPoint = null; updateDrawing(); });
      canvas.addEventListener("click", (event) => { if (path.length >= 5) return; path.push(canvasPoint(canvas, event)); updateDrawing(); });
      displayElement.querySelector(".undo-line").addEventListener("click", () => { path.pop(); updateDrawing(); });
      displayElement.querySelector(".clear-path").addEventListener("click", () => { path = []; updateDrawing(); });
      displayElement.querySelector(".submit-path").addEventListener("click", () => {
        const attempt = recordAttempt(false);
        if (attempt.success) { finishDrawing(true); return; }
        if (attempts.length >= trial.max_attempts) { finishDrawing(false); return; }
        path = []; previewPoint = null; attemptStartedAt = performance.now();
        renderTask(`この経路では ${attempt.coveredDots} / 9点を通過しました。別の経路を試してください。`);
      });
      updateDrawing();
    };

    const finishDrawing = (success) => {
      if (finished) return; finished = true; window.clearInterval(timerId);
      const totalRt = Number((performance.now() - startedAt).toFixed(3));
      displayElement.innerHTML = `<div class="nine-task reflection-screen"><p class="eyebrow">REFLECTION</p><h2>${success ? "9点すべてを結べました" : "課題は終了しました"}</h2><p>取り組みの途中で「解き方が突然分かった」という感覚は、どの程度ありましたか？</p><div class="rating-buttons">${[0, 1, 2, 3, 4].map((rating) => `<button type="button" class="button secondary" data-rating="${rating}">${rating}</button>`).join("")}</div><div class="rating-labels"><span>0 まったくない</span><span>4 とても強い</span></div></div>`;
      for (const button of displayElement.querySelectorAll("[data-rating]")) button.addEventListener("click", () => this.jsPsych.finishTrial({ attempts_json: JSON.stringify(attempts), success, total_rt: totalRt, insight_rating: Number(button.dataset.rating) }));
    };

    renderTask();
    timerId = window.setInterval(() => {
      const label = displayElement.querySelector(".time-remaining"); if (label) label.textContent = `残り ${remainingSeconds()} 秒`;
      if (remainingSeconds() <= 0) { if (!finished) { recordAttempt(true); finishDrawing(false); } }
    }, 250);
  }
}
NineDotPlugin.info = nineDotInfo;

function createTimeline(config) {
  return [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    { type: NineDotPlugin, max_attempts: config.maxAttempts, time_limit: config.timeLimit, data: { phase: "nine_dot" } },
  ];
}

function toExportRows(result, environment) {
  const attempts = JSON.parse(result.attempts_json || "[]"); const recordedAt = new Date().toISOString();
  return attempts.map((attempt) => ({
    experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION, session_id: sessionId, recorded_at: recordedAt,
    attempt_index: attempt.index, segment_count: attempt.segmentCount, covered_dots: attempt.coveredDots, success: attempt.success ? 1 : 0,
    timed_out: attempt.timedOut ? 1 : 0, path_json: JSON.stringify(attempt.path), attempt_rt: attempt.attemptRt, total_rt: result.total_rt,
    insight_rating: result.insight_rating, max_attempts: lastConfig.maxAttempts, time_limit: lastConfig.timeLimit, prior_familiarity: lastConfig.priorFamiliarity,
    browser: environment.browser, os: environment.os, viewport_width: environment.width, viewport_height: environment.height,
  }));
}

function showResults(jsPsych) {
  experimentRunning = false; runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastResult = jsPsych.data.get().filter({ phase: "nine_dot" }).values()[0] || {};
  lastRows = toExportRows(lastResult, environment); const attempts = JSON.parse(lastResult.attempts_json || "[]");
  const maxCovered = attempts.reduce((max, attempt) => Math.max(max, attempt.coveredDots), 0);
  document.querySelector("#summary-cards").innerHTML = `<div><strong>${lastResult.success ? "成功" : "未成功"}</strong><span>課題結果</span></div><div><strong>${attempts.length}</strong><span>試行数</span></div><div><strong>${maxCovered} / 9</strong><span>最大通過点数</span></div><div><strong>${lastResult.insight_rating} / 4</strong><span>ひらめき感</span></div>`;
  const history = document.querySelector("#attempt-history"); history.innerHTML = `<table><thead><tr><th>試行</th><th>線分</th><th>通過点</th><th>結果</th></tr></thead><tbody>${attempts.map((attempt) => `<tr><td>${attempt.index}</td><td>${attempt.segmentCount}</td><td>${attempt.coveredDots} / 9</td><td>${attempt.success ? "成功" : attempt.timedOut ? "時間切れ" : "未成功"}</td></tr>`).join("")}</tbody></table>`;
  drawBoard(document.querySelector("#solution-canvas"), canonicalSolutionPath(), null, Array(9).fill(true));
  resultsSection.hidden = false; resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startExperiment(config) {
  lastConfig = structuredClone(config); sessionId = createSessionId(); lastRows = []; resultsSection.hidden = true;
  setupSections.forEach((section) => { section.hidden = true; }); runner.hidden = false; experimentRunning = true; window.scrollTo({ top: 0, behavior: "instant" });
  const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) }); jsPsych.run(createTimeline(config));
}

function downloadCsv() {
  const blob = new Blob([createNineDotCsv(lastRows)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `nine-dot_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const familiarityField = document.createElement("fieldset");
familiarityField.innerHTML = '<legend>事前知識</legend><div class="preset-group"><label><input type="radio" name="priorFamiliarity" value="unknown" checked><span><strong>初めて取り組む</strong><small>解法を知らない／確かではない</small></span></label><label><input type="radio" name="priorFamiliarity" value="known"><span><strong>以前に経験した</strong><small>解法を知っている</small></span></label></div>';
form.querySelector(".field-grid").after(familiarityField);

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => { if (event.target.name === "preset") { const preset = Presets[event.target.value]; for (const [key, value] of Object.entries(preset)) document.querySelector(`#${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).value = value; } updatePreview(); });
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => { event.preventDefault(); const config = readConfig(); const messages = validateConfig(config); errors.textContent = messages.join(" "); if (messages.length === 0) startExperiment(config); });
document.querySelector("#download-csv").addEventListener("click", downloadCsv);
document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig));
document.querySelector("#change-settings").addEventListener("click", () => { resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = false; }); document.querySelector("#setup").scrollIntoView({ behavior: "smooth" }); });
window.addEventListener("beforeunload", (event) => { if (!experimentRunning) return; event.preventDefault(); event.returnValue = ""; });
updatePreview();
