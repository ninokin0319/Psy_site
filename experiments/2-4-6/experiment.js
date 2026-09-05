import {
  createSessionId,
  createTwoFourSixCsv,
  evaluateTriple,
  summarizeTests,
} from "./logic.mjs";

const EXPERIMENT_ID = "wason-2-4-6";
const EXPERIMENT_VERSION = "1.1.0";
const Presets = Object.freeze({ demo: 8, standard: 15, extended: 25 });
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
  return { preset: String(data.get("preset")), maxTests: Number(data.get("maxTests")), priorFamiliarity: String(data.get("priorFamiliarity")) };
}

function validateConfig(config) {
  const input = document.querySelector("#max-tests");
  const invalid = !Number.isInteger(config.maxTests) || config.maxTests < 3 || config.maxTests > 30;
  input.setAttribute("aria-invalid", String(invalid));
  return invalid ? ["検査できる数列は3〜30回の整数で指定してください。"] : [];
}

function updatePreview() {
  const config = readConfig();
  errors.textContent = validateConfig(config).join(" ");
  document.querySelector("#test-limit").textContent = `最大${config.maxTests}回`;
  document.querySelector("#estimated-time").textContent = `約${Math.max(3, Math.ceil(config.maxTests * 0.45))}分`;
}

function applyDefaults() {
  document.querySelector("input[name='preset'][value='demo']").checked = true;
  document.querySelector("input[name='priorFamiliarity'][value='unknown']").checked = true;
  document.querySelector("#max-tests").value = Presets.demo;
  updatePreview();
}

const parameterType = window.jsPsychModule.ParameterType;
const ruleDiscoveryInfo = {
  name: "rule-discovery-2-4-6",
  version: EXPERIMENT_VERSION,
  parameters: { max_tests: { type: parameterType.INT, default: 8 } },
  data: {
    initial_hypothesis: { type: parameterType.STRING }, final_hypothesis: { type: parameterType.STRING },
    self_evaluation: { type: parameterType.STRING }, tests_json: { type: parameterType.STRING }, task_rt: { type: parameterType.FLOAT },
  },
};

class RuleDiscoveryPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(displayElement, trial) {
    const tests = [];
    const startedAt = performance.now();
    let initialHypothesis = "";

    const renderIntroduction = () => {
      displayElement.innerHTML = '<div class="rule-task"><p class="eyebrow">RULE DISCOVERY</p><h2>「2, 4, 6」に共通する規則を見つけてください</h2><p>この数列は、ある規則に適合しています。まず、現時点で考えた規則を記録してください。正解はまだ表示されません。</p><label class="hypothesis-field">最初の仮説<textarea id="initial-hypothesis" rows="3" maxlength="300" autocomplete="off"></textarea></label><p class="task-error" role="alert" aria-live="polite"></p><button type="button" class="button primary">仮説を記録して検査へ進む</button></div>';
      const textarea = displayElement.querySelector("textarea");
      const error = displayElement.querySelector(".task-error");
      displayElement.querySelector("button").addEventListener("click", () => {
        initialHypothesis = textarea.value.trim();
        if (!initialHypothesis) { error.textContent = "最初の仮説を入力してください。"; textarea.focus(); return; }
        renderTesting();
      });
      textarea.focus();
    };

    const renderHistory = (container) => {
      if (tests.length === 0) { container.textContent = "まだ数列を検査していません。"; return; }
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>回</th><th>検査した数列</th><th>事前予測</th><th>判定</th></tr></thead>";
      const body = document.createElement("tbody");
      for (const test of tests) {
        const row = document.createElement("tr");
        const values = [test.index, test.values.join(", "), test.predictedConforms ? "適合する" : "適合しない", test.conforms ? "適合する" : "適合しない"];
        for (const value of values) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }
        body.append(row);
      }
      table.append(body); container.replaceChildren(table);
    };

    const renderTesting = () => {
      displayElement.innerHTML = `<div class="rule-task rule-task--wide"><div class="task-progress"><span>検査 ${tests.length} / ${trial.max_tests}</span><span>最初の仮説は記録済み</span></div><h2>規則を検査する</h2><p>3つの数と、その数列が規則に適合するかという事前予測を入力します。負数や小数も使えます。</p><form class="triple-form"><div class="triple-inputs"><input type="number" step="any" aria-label="1番目の数" required><input type="number" step="any" aria-label="2番目の数" required><input type="number" step="any" aria-label="3番目の数" required></div><fieldset><legend>この数列は規則に適合すると予測しますか</legend><label><input type="radio" name="prediction" value="yes"> 適合する</label><label><input type="radio" name="prediction" value="no"> 適合しない</label></fieldset><button type="submit" class="button primary" ${tests.length >= trial.max_tests ? "disabled" : ""}>この数列を検査する</button></form><p class="task-feedback" role="status" aria-live="polite"></p><div class="test-history" aria-label="検査履歴"></div><div class="final-hypothesis"><h3>規則が分かったら回答する</h3><label class="hypothesis-field">最終的な仮説<textarea rows="3" maxlength="300" autocomplete="off"></textarea></label><p class="task-error" role="alert" aria-live="polite"></p><button type="button" class="button secondary submit-rule">最終仮説を提出する</button></div></div>`;
      const history = displayElement.querySelector(".test-history");
      renderHistory(history);
      const inputs = [...displayElement.querySelectorAll(".triple-inputs input")];
      const feedback = displayElement.querySelector(".task-feedback");
      const testStartedAt = performance.now();
      displayElement.querySelector(".triple-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (tests.length >= trial.max_tests) return;
        const values = inputs.map((input) => Number(input.value));
        if (values.some((value) => !Number.isFinite(value))) { feedback.textContent = "3つの数をすべて入力してください。"; return; }
        const prediction = new FormData(event.currentTarget).get("prediction");
        if (!prediction) { feedback.textContent = "適合するかどうかの事前予測を選んでください。"; return; }
        const predictedConforms = prediction === "yes";
        const conforms = evaluateTriple(values);
        tests.push({ index: tests.length + 1, values, predictedConforms, conforms, predictionCorrect: predictedConforms === conforms, testRt: Number((performance.now() - testStartedAt).toFixed(3)) });
        renderTesting();
        const newFeedback = displayElement.querySelector(".task-feedback");
        newFeedback.textContent = `${values.join(", ")} は規則に「${conforms ? "適合します" : "適合しません"}」。`;
        newFeedback.classList.add(conforms ? "is-conforming" : "is-nonconforming");
      });
      displayElement.querySelector(".submit-rule").addEventListener("click", () => {
        const finalHypothesis = displayElement.querySelector(".final-hypothesis textarea").value.trim();
        const error = displayElement.querySelector(".task-error");
        if (tests.length === 0) { error.textContent = "少なくとも1つの数列を検査してください。"; return; }
        if (!finalHypothesis) { error.textContent = "最終的な仮説を入力してください。"; return; }
        renderReveal(finalHypothesis);
      });
      if (tests.length < trial.max_tests) inputs[0].focus();
    };

    const renderReveal = (finalHypothesis) => {
      displayElement.innerHTML = '<div class="rule-task"><p class="eyebrow">ANSWER</p><h2>隠された規則</h2><p class="revealed-rule">左から右へ、数が厳密に増加する3数</p><p>例：1, 2, 3 や −5, 0, 20 は適合し、3, 2, 1 や 1, 1, 2 は適合しません。</p><h3>あなたの最終仮説は、この規則とどの程度一致していましたか？</h3><div class="evaluation-buttons"><button type="button" class="button secondary" data-evaluation="一致">一致</button><button type="button" class="button secondary" data-evaluation="一部一致">一部一致</button><button type="button" class="button secondary" data-evaluation="不一致">不一致</button></div></div>';
      for (const button of displayElement.querySelectorAll("[data-evaluation]")) {
        button.addEventListener("click", () => this.jsPsych.finishTrial({
          initial_hypothesis: initialHypothesis,
          final_hypothesis: finalHypothesis,
          self_evaluation: button.dataset.evaluation,
          tests_json: JSON.stringify(tests),
          task_rt: Number((performance.now() - startedAt).toFixed(3)),
        }));
      }
    };

    renderIntroduction();
  }
}
RuleDiscoveryPlugin.info = ruleDiscoveryInfo;

function createTimeline(config) {
  return [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    { type: RuleDiscoveryPlugin, max_tests: config.maxTests, data: { phase: "rule_discovery" } },
  ];
}

function toExportRows(result, environment) {
  const tests = JSON.parse(result.tests_json || "[]");
  const summary = summarizeTests(tests);
  const shared = {
    experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION, session_id: sessionId,
    recorded_at: new Date().toISOString(), initial_hypothesis: result.initial_hypothesis,
    final_hypothesis: result.final_hypothesis, self_evaluation: result.self_evaluation,
    total_tests: summary.total, conforming_tests: summary.conforming, nonconforming_tests: summary.nonconforming,
    max_tests: lastConfig.maxTests, prior_familiarity: lastConfig.priorFamiliarity, task_rt: result.task_rt, browser: environment.browser, os: environment.os,
    viewport_width: environment.width, viewport_height: environment.height,
  };
  return tests.map((test) => ({ ...shared, test_index: test.index, number_1: test.values[0], number_2: test.values[1], number_3: test.values[2], predicted_conforms: test.predictedConforms ? 1 : 0, conforms: test.conforms ? 1 : 0, prediction_correct: test.predictionCorrect ? 1 : 0, test_rt: test.testRt }));
}

function showResults(jsPsych) {
  experimentRunning = false; runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  lastResult = jsPsych.data.get().filter({ phase: "rule_discovery" }).values()[0] || {};
  lastRows = toExportRows(lastResult, environment);
  const tests = JSON.parse(lastResult.tests_json || "[]");
  const summary = summarizeTests(tests);
  document.querySelector("#summary-cards").innerHTML = `<div><strong>${summary.total}</strong><span>検査した数列</span></div><div><strong>${summary.conforming}</strong><span>適合例</span></div><div><strong>${summary.nonconforming}</strong><span>不適合例</span></div>`;
  document.querySelector("#hypothesis-summary").replaceChildren();
  const hypothesisSummary = document.querySelector("#hypothesis-summary");
  for (const [label, value] of [["最初の仮説", lastResult.initial_hypothesis], ["最終仮説", lastResult.final_hypothesis], ["自己評価", lastResult.self_evaluation]]) {
    const block = document.createElement("div"); const heading = document.createElement("strong"); const text = document.createElement("p");
    heading.textContent = label; text.textContent = value; block.append(heading, text); hypothesisSummary.append(block);
  }
  const history = document.querySelector("#result-history"); history.replaceChildren();
  const table = document.createElement("table"); table.innerHTML = "<thead><tr><th>回</th><th>数列</th><th>事前予測</th><th>判定</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const test of tests) { const row = document.createElement("tr"); for (const value of [test.index, test.values.join(", "), test.predictedConforms ? "適合" : "不適合", test.conforms ? "適合" : "不適合"]) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); } body.append(row); }
  table.append(body); history.append(table);
  resultsSection.hidden = false; resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startExperiment(config) {
  lastConfig = structuredClone(config); sessionId = createSessionId(); lastRows = []; resultsSection.hidden = true;
  setupSections.forEach((section) => { section.hidden = true; }); runner.hidden = false; experimentRunning = true;
  window.scrollTo({ top: 0, behavior: "instant" });
  const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) });
  jsPsych.run(createTimeline(config));
}

function downloadCsv() {
  const blob = new Blob([createTwoFourSixCsv(lastRows)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `2-4-6_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const familiarityField = document.createElement("fieldset");
familiarityField.innerHTML = '<legend>事前知識</legend><div class="preset-group"><label><input type="radio" name="priorFamiliarity" value="unknown" checked><span><strong>初めて取り組む</strong><small>規則を知らない／確かではない</small></span></label><label><input type="radio" name="priorFamiliarity" value="known"><span><strong>以前に経験した</strong><small>規則または解法を知っている</small></span></label></div>';
form.querySelector(".field-grid").after(familiarityField);

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => { if (event.target.name === "preset") document.querySelector("#max-tests").value = Presets[event.target.value]; updatePreview(); });
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => { event.preventDefault(); const config = readConfig(); const messages = validateConfig(config); errors.textContent = messages.join(" "); if (messages.length === 0) startExperiment(config); });
document.querySelector("#download-csv").addEventListener("click", downloadCsv);
document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig));
document.querySelector("#change-settings").addEventListener("click", () => { resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = false; }); document.querySelector("#setup").scrollIntoView({ behavior: "smooth" }); });
window.addEventListener("beforeunload", (event) => { if (!experimentRunning) return; event.preventDefault(); event.returnValue = ""; });
updatePreview();
