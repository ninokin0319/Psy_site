import {
  buildConditions,
  buildWingSegments,
  createCsv,
  createSessionId,
  describeWingAngle,
  summarizeResults,
} from "./logic.mjs";

const EXPERIMENT_ID = "muller-lyer-adjustment";
const EXPERIMENT_VERSION = "1.3.0";
const STIMULUS_WIDTH = 600;
const PREVIEW_HEIGHT = 380;
const TRIAL_HEIGHT = 470;

// 設定値を1か所に集め、授業中に変更箇所を見つけやすくします。
const ExperimentConfig = {
  preset: "demo",
  standardLength: 150,
  wingLength: 50,
  angles: [60, 300],
  initialLengths: [80, 220],
  stepSize: 5,
  repetitions: 2,
  iti: 250,
};

const Presets = {
  demo: { repetitions: 2, stepSize: 5, iti: 250 },
  standard: { repetitions: 5, stepSize: 5, iti: 250 },
  precision: { repetitions: 10, stepSize: 1, iti: 500 },
};

const form = document.querySelector("#config-form");
const previewCanvas = document.querySelector("#stimulus-preview");
const previewContext = prepareCanvas(previewCanvas, STIMULUS_WIDTH, PREVIEW_HEIGHT);
const errors = document.querySelector("#config-errors");
const trialCount = document.querySelector("#trial-count");
const estimatedTime = document.querySelector("#estimated-time");
const conditionSummary = document.querySelector("#condition-summary");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".experiment-hero, .explanation-panel, .references-panel, .setup-section, #device-warning")];

let experimentRunning = false;
let lastConfig = null;
let lastRows = [];
let sessionId = "";

// Canvasの論理座標はCSS pxに固定し、端末の画素密度だけ内部解像度へ反映します。
function prepareCanvas(canvas, logicalWidth, logicalHeight) {
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  canvas.width = Math.round(logicalWidth * ratio);
  canvas.height = Math.round(logicalHeight * ratio);
  canvas.dataset.logicalWidth = String(logicalWidth);
  canvas.dataset.logicalHeight = String(logicalHeight);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function readConfig() {
  const data = new FormData(form);
  return {
    preset: data.get("preset"),
    standardLength: Number(data.get("standardLength")),
    wingLength: Number(data.get("wingLength")),
    angles: [Number(data.get("angleOne")), Number(data.get("angleTwo"))],
    initialLengths: [Number(data.get("initialShort")), Number(data.get("initialLong"))],
    stepSize: Number(data.get("stepSize")),
    repetitions: Number(data.get("repetitions")),
    iti: Number(data.get("iti")),
  };
}

function drawLine(ctx, centerX, centerY, length) {
  ctx.beginPath();
  ctx.moveTo(centerX - length / 2, centerY);
  ctx.lineTo(centerX + length / 2, centerY);
  ctx.stroke();
}

function drawMullerLyer(ctx, centerX, centerY, length, wingLength, angleDegrees) {
  drawLine(ctx, centerX, centerY, length);
  ctx.beginPath();
  for (const segment of buildWingSegments(centerX, centerY, length, wingLength, angleDegrees)) {
    ctx.moveTo(...segment.from);
    ctx.lineTo(...segment.to);
  }
  ctx.stroke();
}

function drawStimulus(ctx, config, wingAngle, comparisonLength, showLabels = false) {
  const logicalWidth = Number(ctx.canvas.dataset.logicalWidth || STIMULUS_WIDTH);
  const logicalHeight = Number(ctx.canvas.dataset.logicalHeight || TRIAL_HEIGHT);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  ctx.save();
  ctx.strokeStyle = "#17221d";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  drawMullerLyer(ctx, 300, 140, config.standardLength, config.wingLength, wingAngle);
  drawLine(ctx, 300, 330, comparisonLength);
  if (showLabels) {
    const wing = describeWingAngle(wingAngle);
    ctx.fillStyle = "#5f6b65";
    ctx.font = "15px sans-serif";
    ctx.fillText(`標準刺激：${wing.directionLabel}（矢羽角度${wingAngle}°）`, 24, 34);
    ctx.fillText("比較刺激", 24, 275);
  }
  ctx.restore();
}

function drawPreview(config) {
  previewContext.clearRect(0, 0, STIMULUS_WIDTH, PREVIEW_HEIGHT);
  previewContext.save();
  previewContext.strokeStyle = "#17221d";
  previewContext.fillStyle = "#5f6b65";
  previewContext.lineWidth = 4;
  previewContext.lineCap = "round";
  previewContext.font = "15px sans-serif";

  config.angles.forEach((angle, index) => {
    const wing = describeWingAngle(angle);
    const centerY = 105 + index * 135;
    drawMullerLyer(previewContext, 300, centerY, config.standardLength, config.wingLength, angle);
    previewContext.fillText(`${wing.directionLabel}：矢羽角度${angle}°（小さい方の角${wing.smallerAngle}°）`, 24, centerY - 45);
  });
  drawLine(previewContext, 300, 330, config.standardLength);
  previewContext.fillText("比較線（標準線と同じ物理長）", 24, 310);
  previewContext.restore();
}

function validateConfig(config) {
  const messages = [];
  for (const input of form.querySelectorAll("input[type='number']")) {
    const value = Number(input.value);
    const invalid = !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max);
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid) messages.push(`${input.closest("label").firstChild.textContent.trim()}を範囲内で入力してください。`);
  }
  if (config.initialLengths[0] >= config.standardLength) messages.push("短い初期値は標準線より短くしてください。");
  if (config.initialLengths[1] <= config.standardLength) messages.push("長い初期値は標準線より長くしてください。");
  if (config.angles[0] === config.angles[1]) messages.push("2つの矢羽角度は異なる値にしてください。");
  if (config.angles[0] >= 180 || config.angles[1] <= 180) messages.push("条件1は内向（180°未満）、条件2は外向（180°より大きい）にしてください。");
  return [...new Set(messages)];
}

function updatePreview() {
  const config = readConfig();
  const messages = validateConfig(config);
  errors.textContent = messages.join(" ");
  if (messages.length === 0) drawPreview(config);
  const total = config.angles.length * config.initialLengths.length * config.repetitions;
  trialCount.textContent = `全${total}試行`;
  conditionSummary.textContent = `2矢羽条件 × 2初期値 × ${config.repetitions}反復`;
  estimatedTime.textContent = `約${Math.max(3, Math.ceil(total * 0.28))}分`;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("#standard-length").value = ExperimentConfig.standardLength;
  document.querySelector("#wing-length").value = ExperimentConfig.wingLength;
  document.querySelector("#angle-one").value = ExperimentConfig.angles[0];
  document.querySelector("#angle-two").value = ExperimentConfig.angles[1];
  document.querySelector("#initial-short").value = ExperimentConfig.initialLengths[0];
  document.querySelector("#initial-long").value = ExperimentConfig.initialLengths[1];
  document.querySelector("#step-size").value = ExperimentConfig.stepSize;
  document.querySelector("#repetitions").value = ExperimentConfig.repetitions;
  document.querySelector("#iti").value = ExperimentConfig.iti;
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const adjustmentPluginInfo = {
  name: "muller-lyer-adjustment",
  version: EXPERIMENT_VERSION,
  parameters: {
    config: { type: parameterType.OBJECT, default: undefined },
    wing_angle: { type: parameterType.INT, default: undefined },
    initial_comparison_length: { type: parameterType.INT, default: undefined },
    phase: { type: parameterType.STRING, default: "main" },
    trial_index: { type: parameterType.INT, default: 0 },
    total_trials: { type: parameterType.INT, default: 1 },
  },
  data: {
    wing_angle: { type: parameterType.INT },
    initial_comparison_length: { type: parameterType.INT },
    final_comparison_length: { type: parameterType.INT },
    adjustment_count: { type: parameterType.INT },
    rt: { type: parameterType.FLOAT },
    blur_count: { type: parameterType.INT },
  },
};

class MullerLyerAdjustmentPlugin {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement, trial) {
    const isPractice = trial.phase === "practice";
    const phaseText = isPractice ? "操作練習" : "本試行";
    const progress = Math.round(((trial.trial_index + 1) / trial.total_trials) * 100);
    let comparisonLength = trial.initial_comparison_length;
    let adjustmentCount = 0;
    let blurCount = 0;
    let startedAt = null;

    displayElement.innerHTML = `
      <div class="trial-screen">
        <div class="trial-toolbar"><strong>${phaseText}</strong><span>${trial.trial_index + 1} / ${trial.total_trials}</span></div>
        <div class="progress-track" aria-hidden="true"><span style="width:${progress}%"></span></div>
        <div class="trial-canvas-wrap"><canvas width="600" height="470" aria-label="上段に矢羽付き標準線、下段に調整する比較線"></canvas></div>
        <div class="trial-controls"><span><kbd>↑</kbd> 長くする</span><span><kbd>↓</kbd> 短くする</span><span><kbd>Space</kbd> 同じに見えたら決定</span></div>
        <p class="trial-status" aria-live="polite"></p>
      </div>`;

    const canvas = displayElement.querySelector("canvas");
    const ctx = prepareCanvas(canvas, STIMULUS_WIDTH, TRIAL_HEIGHT);
    const status = displayElement.querySelector(".trial-status");
    const redraw = () => drawStimulus(ctx, trial.config, trial.wing_angle, comparisonLength);
    redraw();

    const onBlur = () => { blurCount += 1; };
    const onKeyDown = (event) => {
      if (event.repeat || !["ArrowUp", "ArrowDown", " "].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowUp") {
        comparisonLength = Math.min(300, comparisonLength + trial.config.stepSize);
        adjustmentCount += 1;
        status.textContent = `比較線：${comparisonLength}px`;
        redraw();
        return;
      }
      if (event.key === "ArrowDown") {
        comparisonLength = Math.max(20, comparisonLength - trial.config.stepSize);
        adjustmentCount += 1;
        status.textContent = `比較線：${comparisonLength}px`;
        redraw();
        return;
      }

      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      this.jsPsych.finishTrial({
        wing_angle: trial.wing_angle,
        initial_comparison_length: trial.initial_comparison_length,
        final_comparison_length: comparisonLength,
        adjustment_count: adjustmentCount,
        rt: Number((performance.now() - startedAt).toFixed(3)),
        blur_count: blurCount,
      });
    };

    // ブラウザが刺激を実際に描画する機会を2回待ってから計時とキー受付を始めます。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      startedAt = performance.now();
      status.textContent = "準備完了";
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("blur", onBlur);
    }));
  }
}
MullerLyerAdjustmentPlugin.info = adjustmentPluginInfo;

function instructionTrial(phase, title, text) {
  return {
    type: window.jsPsychHtmlKeyboardResponse,
    stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p><div class="key-guide"><kbd>↑</kbd> 長くする　<kbd>↓</kbd> 短くする　<kbd>Space</kbd> 決定</div><p><kbd>Space</kbd> を押すと進みます。</p></div>`,
    choices: [" "],
  };
}

function createTimeline(config) {
  const conditions = buildConditions(config);
  const practiceConditions = [
    { wingAngle: config.angles[0], initialComparisonLength: config.initialLengths[0] },
    { wingAngle: config.angles[1], initialComparisonLength: config.initialLengths[1] },
  ];

  const practiceTrials = practiceConditions.map((condition, index) => ({
    type: MullerLyerAdjustmentPlugin,
    config,
    wing_angle: condition.wingAngle,
    initial_comparison_length: condition.initialComparisonLength,
    phase: "practice",
    trial_index: index,
    total_trials: practiceConditions.length,
    data: { phase: "practice" },
  }));

  const mainTrials = conditions.map((condition, index) => ({
    type: MullerLyerAdjustmentPlugin,
    config,
    wing_angle: condition.wingAngle,
    initial_comparison_length: condition.initialComparisonLength,
    phase: "main",
    trial_index: index,
    total_trials: conditions.length,
    post_trial_gap: config.iti,
    data: {
      phase: "main",
      experiment_id: EXPERIMENT_ID,
      experiment_version: EXPERIMENT_VERSION,
      session_id: sessionId,
      recorded_at: new Date().toISOString(),
      trial_index: index + 1,
      condition_order: index + 1,
      standard_length: config.standardLength,
      wing_length: config.wingLength,
      step_size: config.stepSize,
      preset: config.preset,
      repetitions: config.repetitions,
    },
  }));

  return [
    {
      type: window.jsPsychBrowserCheck,
      features: ["width", "height", "browser", "browser_version", "mobile", "os", "fullscreen", "vsync_rate"],
      vsync_frame_count: 60,
      data: {
        phase: "environment",
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        device_pixel_ratio: window.devicePixelRatio || 1,
      },
    },
    instructionTrial("PRACTICE", "まずは2試行、操作を練習します", "練習データは結果やCSVには含まれません。線を何度でも動かし、自分の判断で同じに見えるところを探してください。"),
    ...practiceTrials,
    instructionTrial("MAIN SESSION", "練習は終了です", `ここから本試行${conditions.length}回です。速さよりも、毎回同じ基準で判断することを意識してください。`),
    ...mainTrials,
    {
      type: window.jsPsychHtmlKeyboardResponse,
      stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>すべての試行が終わりました</h2><p>結果を集計しています。</p></div>',
      choices: "NO_KEYS",
      trial_duration: 450,
    },
  ];
}

function toExportRows(rawRows, environment = {}) {
  return rawRows.map((row) => ({
    experiment_id: row.experiment_id,
    experiment_version: row.experiment_version,
    session_id: row.session_id,
    recorded_at: row.recorded_at,
    trial_index: row.trial_index,
    condition_order: row.condition_order,
    wing_angle: row.wing_angle,
    wing_direction: describeWingAngle(row.wing_angle).direction,
    wing_smaller_angle: describeWingAngle(row.wing_angle).smallerAngle,
    standard_length: row.standard_length,
    wing_length: row.wing_length,
    initial_comparison_length: row.initial_comparison_length,
    step_size: row.step_size,
    final_comparison_length: row.final_comparison_length,
    adjustment_count: row.adjustment_count,
    rt: row.rt,
    blur_count: row.blur_count,
    quality_flag: row.blur_count > 0 ? "attention_interrupted" : "ok",
    preset: row.preset,
    repetitions: row.repetitions,
    browser: environment.browser,
    browser_version: environment.browser_version,
    os: environment.os,
    viewport_width: environment.width,
    viewport_height: environment.height,
    screen_width: environment.screen_width,
    screen_height: environment.screen_height,
    device_pixel_ratio: environment.device_pixel_ratio,
    vsync_rate: environment.vsync_rate,
  }));
}

function drawResultChart(summary, standardLength) {
  const canvas = document.querySelector("#result-chart");
  const ctx = canvas.getContext("2d");
  const padding = { top: 30, right: 30, bottom: 55, left: 58 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const values = summary.map((item) => item.pse).concat(standardLength);
  const min = Math.floor((Math.min(...values) - 20) / 10) * 10;
  const max = Math.ceil((Math.max(...values) + 20) / 10) * 10;
  const y = (value) => padding.top + height - ((value - min) / (max - min)) * height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#5f6b65";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "right";
  for (let value = min; value <= max; value += 10) {
    ctx.beginPath();
    ctx.moveTo(padding.left, y(value));
    ctx.lineTo(canvas.width - padding.right, y(value));
    ctx.strokeStyle = value === standardLength ? "#315c45" : "#d5d9d3";
    ctx.setLineDash(value === standardLength ? [7, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(String(value), padding.left - 10, y(value) + 5);
  }

  const slot = width / summary.length;
  summary.forEach((item, index) => {
    const x = padding.left + slot * index + slot / 2;
    const pointY = y(item.pse);
    const color = index % 2 === 0 ? "#315c45" : "#7b9f8b";
    ctx.beginPath();
    ctx.moveTo(x, y(standardLength));
    ctx.lineTo(x, pointY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, pointY, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#17221d";
    ctx.textAlign = "center";
    ctx.fillText(`${item.pse.toFixed(1)}px`, x, pointY - 14);
    const wing = describeWingAngle(item.angle);
    ctx.fillText(`${wing.directionLabel} ${item.angle}°`, x, canvas.height - 24);
  });
}

function showResults(jsPsych) {
  experimentRunning = false;
  runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastRows = toExportRows(jsPsych.data.get().filter({ phase: "main" }).values(), environment);
  const summary = summarizeResults(lastRows, lastConfig.standardLength);
  const body = document.querySelector("#summary-body");
  body.innerHTML = summary.map((item) => {
    const wing = describeWingAngle(item.angle);
    return `<tr><td>${wing.directionLabel}（${item.angle}°）</td><td>${item.count}</td><td>${item.pse.toFixed(1)}px</td><td>${item.adjustmentError >= 0 ? "+" : ""}${item.adjustmentError.toFixed(1)}px</td></tr>`;
  }).join("");
  const interruptedCount = lastRows.filter((row) => row.quality_flag !== "ok").length;
  document.querySelector("#quality-summary").textContent = interruptedCount === 0
    ? `測定品質：全${lastRows.length}試行で画面離脱は記録されませんでした。`
    : `測定品質：${lastRows.length}試行中${interruptedCount}試行で画面離脱を記録しました。該当行のquality_flagを確認してください。`;
  drawResultChart(summary, lastConfig.standardLength);
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

  const jsPsych = window.initJsPsych({
    display_element: "jspsych-target",
    on_finish: () => showResults(jsPsych),
  });
  jsPsych.run(createTimeline(config));
}

function formatFilename() {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return `muller-lyer_${stamp}_${sessionId}.csv`;
}

function downloadCsv() {
  const blob = new Blob([createCsv(lastRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = formatFilename();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => {
  if (event.target.name === "preset") {
    const preset = Presets[event.target.value];
    document.querySelector("#repetitions").value = preset.repetitions;
    document.querySelector("#step-size").value = preset.stepSize;
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

const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const isMobile = hasMobileUserAgent || window.matchMedia("(max-width: 700px) and (pointer: coarse)").matches;
if (isMobile) {
  document.querySelector("#device-warning").hidden = false;
  document.querySelector("#start-experiment").disabled = true;
}

updatePreview();
