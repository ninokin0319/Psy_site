import {
  applyMove,
  createHanoiCsv,
  createSessionId,
  createTowerState,
  isSolved,
  minimumMoves,
  summarizeHanoi,
} from "./logic.mjs";

const EXPERIMENT_ID = "tower-of-hanoi";
const EXPERIMENT_VERSION = "1.0.0";
const Presets = Object.freeze({ demo: { diskCount: 3, timeLimitMinutes: 3 }, standard: { diskCount: 4, timeLimitMinutes: 5 }, advanced: { diskCount: 5, timeLimitMinutes: 10 } });
const pegLabels = ["左", "中央", "右"];
const form = document.querySelector("#config-form");
const errors = document.querySelector("#config-errors");
const runner = document.querySelector("#experiment-runner");
const resultsSection = document.querySelector("#results");
const setupSections = [...document.querySelectorAll(".lesson-hero, .explanation-panel, .references-panel, .setup-section")];
let experimentRunning = false;
let sessionId = "";
let lastConfig = null;
let lastRows = [];

function readConfig() { const data = new FormData(form); return { preset: data.get("preset"), diskCount: Number(data.get("diskCount")), goalPeg: Number(data.get("goalPeg")), timeLimitMinutes: Number(data.get("timeLimitMinutes")) }; }
function validateConfig(config) {
  const messages = [];
  const timeInput = document.querySelector("#time-limit");
  const invalidTime = !Number.isFinite(config.timeLimitMinutes) || config.timeLimitMinutes < 1 || config.timeLimitMinutes > 20;
  timeInput.setAttribute("aria-invalid", String(invalidTime));
  if (invalidTime) messages.push("制限時間を1〜20分で入力してください。");
  return messages;
}

function diskHtml(disk) { return `<span class="disk" style="--disk:${disk}" aria-label="円盤${disk}"></span>`; }
function boardHtml(state, goalPeg, interactive = false, selectedPeg = null) {
  return state.map((disks, peg) => `<${interactive ? "button" : "div"} ${interactive ? 'type="button"' : ""} class="tower-peg${peg === goalPeg ? " goal" : ""}${peg === selectedPeg ? " selected" : ""}" data-peg="${peg}" aria-label="${pegLabels[peg]}の杭、円盤${disks.length}枚">${disks.map(diskHtml).join("")}${interactive ? `<span class="peg-label">${pegLabels[peg]}</span>` : ""}</${interactive ? "button" : "div"}>`).join("");
}
function updatePreview() {
  const config = readConfig();
  errors.textContent = validateConfig(config).join(" ");
  document.querySelector("#tower-preview").innerHTML = boardHtml(createTowerState(config.diskCount), config.goalPeg);
  document.querySelector("#minimum-badge").textContent = `最少${minimumMoves(config.diskCount)}手`;
  document.querySelector("#disk-summary").textContent = `${config.diskCount}枚`;
  document.querySelector("#goal-summary").textContent = `${pegLabels[config.goalPeg]}の杭`;
}
function applyDefaults() { document.querySelector("input[name='preset'][value='demo']").checked = true; document.querySelector("#disk-count").value = "3"; document.querySelector("#goal-peg").value = "2"; document.querySelector("#time-limit").value = "3"; updatePreview(); }

const parameterType = window.jsPsychModule.ParameterType;
const pluginInfo = { name: "tower-of-hanoi", version: EXPERIMENT_VERSION, parameters: { disk_count: { type: parameterType.INT, default: 3 }, goal_peg: { type: parameterType.INT, default: 2 }, time_limit_ms: { type: parameterType.INT, default: 180000 }, phase_label: { type: parameterType.STRING, default: "本課題" }, allow_end: { type: parameterType.BOOL, default: true } }, data: { move_events: { type: parameterType.OBJECT }, completed: { type: parameterType.BOOL }, legal_moves: { type: parameterType.INT }, illegal_attempts: { type: parameterType.INT }, elapsed_ms: { type: parameterType.FLOAT }, restart_count: { type: parameterType.INT } } };

class TowerOfHanoiPlugin {
  constructor(jsPsych) { this.jsPsych = jsPsych; }
  trial(displayElement, trial) {
    let state = createTowerState(trial.disk_count);
    let selectedPeg = null;
    let legalMoves = 0;
    let illegalAttempts = 0;
    let restartCount = 0;
    let runIndex = 1;
    let attemptIndex = 0;
    let events = [];
    let startedAt = null;
    let timeoutId = null;
    let finished = false;

    displayElement.innerHTML = `<div class="hanoi-task"><div class="hanoi-toolbar"><strong>${trial.phase_label}：円盤${trial.disk_count}枚</strong><span>最少手数 ${minimumMoves(trial.disk_count)}　｜　移動 <b id="move-count">0</b>　｜　不正 <b id="illegal-count">0</b></span></div><div class="hanoi-board" aria-label="Tower of Hanoi盤面"></div><p class="hanoi-status" aria-live="polite">移動元の杭を選んでください。</p><div class="hanoi-actions"><button type="button" class="button secondary" id="restart-task">最初からやり直す</button>${trial.allow_end ? '<button type="button" class="button quiet" id="end-task">ここで終了する</button>' : ""}</div></div>`;
    const board = displayElement.querySelector(".hanoi-board");
    const status = displayElement.querySelector(".hanoi-status");

    const elapsed = () => Number((performance.now() - startedAt).toFixed(3));
    const render = () => {
      board.innerHTML = boardHtml(state, trial.goal_peg, true, selectedPeg);
      displayElement.querySelector("#move-count").textContent = legalMoves;
      displayElement.querySelector("#illegal-count").textContent = illegalAttempts;
    };
    const record = ({ sourcePeg, targetPeg, disk, legal, reason }) => {
      attemptIndex += 1;
      events.push({ runIndex, attemptIndex, sourcePeg, targetPeg, disk, legalMove: legal ? 1 : 0, errorReason: reason, elapsedMs: elapsed(), stateAfter: JSON.stringify(state) });
    };
    const finish = (completed) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeoutId);
      this.jsPsych.finishTrial({ move_events: events, completed, legal_moves: legalMoves, illegal_attempts: illegalAttempts, elapsed_ms: elapsed(), restart_count: restartCount });
    };
    const clickPeg = (peg) => {
      if (selectedPeg === null) {
        if (state[peg].length === 0) {
          illegalAttempts += 1;
          record({ sourcePeg: peg, targetPeg: null, disk: null, legal: false, reason: "empty-source" });
          status.textContent = "空の杭からは円盤を取れません。";
          render();
          return;
        }
        selectedPeg = peg;
        status.textContent = `${pegLabels[peg]}の杭を選択しました。移動先を選んでください。`;
        render();
        return;
      }
      if (selectedPeg === peg) {
        selectedPeg = null;
        status.textContent = "選択を解除しました。移動元を選んでください。";
        render();
        return;
      }
      const sourcePeg = selectedPeg;
      const result = applyMove(state, sourcePeg, peg);
      if (result.legal) {
        state = result.state;
        legalMoves += 1;
        status.textContent = `円盤${result.disk}を${pegLabels[peg]}へ移動しました。`;
      } else {
        illegalAttempts += 1;
        status.textContent = result.reason === "larger-on-smaller" ? "大きな円盤を小さな円盤の上には置けません。" : "その移動はできません。";
      }
      record({ sourcePeg, targetPeg: peg, disk: result.disk, legal: result.legal, reason: result.reason });
      selectedPeg = null;
      render();
      if (isSolved(state, trial.goal_peg, trial.disk_count)) {
        status.textContent = `完成です。${legalMoves}手で移動しました。`;
        board.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        window.setTimeout(() => finish(true), 700);
      }
    };
    board.addEventListener("click", (event) => { const button = event.target.closest("[data-peg]"); if (button && !finished) clickPeg(Number(button.dataset.peg)); });
    displayElement.querySelector("#restart-task").addEventListener("click", () => {
      restartCount += 1; runIndex += 1; attemptIndex = 0; state = createTowerState(trial.disk_count); selectedPeg = null; legalMoves = 0; illegalAttempts = 0; status.textContent = "最初からやり直します。移動元を選んでください。"; render();
    });
    displayElement.querySelector("#end-task")?.addEventListener("click", () => finish(false));
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => { startedAt = performance.now(); timeoutId = window.setTimeout(() => { status.textContent = "制限時間になりました。"; window.setTimeout(() => finish(false), 500); }, trial.time_limit_ms); }));
  }
}
TowerOfHanoiPlugin.info = pluginInfo;

function instructionTrial(phase, title, text) { return { type: window.jsPsychHtmlKeyboardResponse, stimulus: `<div class="instruction-screen"><p class="phase-label">${phase}</p><h2>${title}</h2><p>${text}</p><p><kbd>Space</kbd> を押すと進みます。</p></div>`, choices: [" "] }; }
function createTimeline(config) {
  return [
    { type: window.jsPsychBrowserCheck, features: ["width", "height", "browser", "browser_version", "mobile", "os"], data: { phase: "environment" } },
    instructionTrial("PRACTICE", "2枚の円盤で操作を練習します", "杭をクリックして移動元と移動先を指定し、左の円盤をすべて右へ移してください。"),
    { type: TowerOfHanoiPlugin, disk_count: 2, goal_peg: 2, time_limit_ms: 120000, phase_label: "操作練習", allow_end: false, data: { phase: "practice" } },
    instructionTrial("MAIN TASK", `円盤${config.diskCount}枚の本課題を始めます`, `左の杭から${pegLabels[config.goalPeg]}の杭へ、できるだけ少ない手数で全円盤を移してください。`),
    { type: TowerOfHanoiPlugin, disk_count: config.diskCount, goal_peg: config.goalPeg, time_limit_ms: config.timeLimitMinutes * 60000, phase_label: "本課題", allow_end: true, data: { phase: "main", experiment_id: EXPERIMENT_ID, experiment_version: EXPERIMENT_VERSION, session_id: sessionId, recorded_at: new Date().toISOString(), disk_count: config.diskCount, goal_peg: config.goalPeg, minimum_moves: minimumMoves(config.diskCount), preset: config.preset } },
    { type: window.jsPsychHtmlKeyboardResponse, stimulus: '<div class="instruction-screen"><p class="phase-label">COMPLETE</p><h2>課題を終了しました</h2><p>結果を集計しています。</p></div>', choices: "NO_KEYS", trial_duration: 400 },
  ];
}

function toExportRows(task, environment) {
  const events = task.move_events?.length ? task.move_events : [{ runIndex: 1, attemptIndex: 0, sourcePeg: null, targetPeg: null, disk: null, legalMove: null, errorReason: "no-attempt", elapsedMs: task.elapsed_ms, stateAfter: JSON.stringify(createTowerState(task.disk_count)) }];
  return events.map((event) => ({ experiment_id: task.experiment_id, experiment_version: task.experiment_version, session_id: task.session_id, recorded_at: task.recorded_at, run_index: event.runIndex, attempt_index: event.attemptIndex, source_peg: event.sourcePeg, target_peg: event.targetPeg, disk: event.disk, legal_move: event.legalMove, error_reason: event.errorReason, elapsed_ms: event.elapsedMs, state_after: event.stateAfter, disk_count: task.disk_count, goal_peg: task.goal_peg, minimum_moves: task.minimum_moves, completed: task.completed ? 1 : 0, final_legal_moves: task.legal_moves, final_illegal_attempts: task.illegal_attempts, final_elapsed_ms: task.elapsed_ms, restart_count: task.restart_count, preset: task.preset, browser: environment.browser, os: environment.os, viewport_width: environment.width, viewport_height: environment.height }));
}
function showResults(jsPsych) {
  experimentRunning = false; runner.hidden = true;
  const environment = jsPsych.data.get().filter({ phase: "environment" }).values()[0] || {};
  const task = jsPsych.data.get().filter({ phase: "main" }).values()[0];
  lastRows = toExportRows(task, environment);
  const summary = summarizeHanoi({ completed: task.completed, diskCount: task.disk_count, legalMoves: task.legal_moves, illegalAttempts: task.illegal_attempts, elapsedMs: task.elapsed_ms, restartCount: task.restart_count });
  document.querySelector("#completion-message").textContent = summary.completed ? "目標状態まで完成しました。最後の取り組みを最少手数と比較します。" : "課題は未完成で終了しました。途中までの過程もCSVに保存できます。";
  document.querySelector("#legal-moves").textContent = `${summary.legalMoves}手`;
  document.querySelector("#minimum-detail").textContent = `最少 ${summary.minimumMoves}手`;
  document.querySelector("#excess-moves").textContent = summary.excessMoves === null ? "—" : `${summary.excessMoves >= 0 ? "+" : ""}${summary.excessMoves}手`;
  document.querySelector("#elapsed-time").textContent = `${(summary.elapsedMs / 1000).toFixed(1)}秒`;
  document.querySelector("#attempt-detail").textContent = `再開始 ${summary.restartCount}回`;
  document.querySelector("#summary-body").innerHTML = `<tr><th>完了</th><td>${summary.completed ? "はい" : "いいえ"}</td></tr><tr><th>合法な移動</th><td>${summary.legalMoves}手</td></tr><tr><th>不正移動</th><td>${summary.illegalAttempts}回</td></tr><tr><th>最少手数</th><td>${summary.minimumMoves}手</td></tr><tr><th>手数効率</th><td>${summary.moveEfficiency === null ? "—" : `${(summary.moveEfficiency * 100).toFixed(1)}%`}</td></tr>`;
  resultsSection.hidden = false; resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}
function startExperiment(config) { lastConfig = structuredClone(config); sessionId = createSessionId(); resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = true; }); runner.hidden = false; experimentRunning = true; window.scrollTo({ top: 0, behavior: "instant" }); const jsPsych = window.initJsPsych({ display_element: "jspsych-target", on_finish: () => showResults(jsPsych) }); jsPsych.run(createTimeline(config)); }
function downloadCsv() { const blob = new Blob([createHanoiCsv(lastRows)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `tower-of-hanoi_${new Date().toISOString().replaceAll(":", "-")}_${sessionId}.csv`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

form.addEventListener("input", updatePreview);
form.addEventListener("change", (event) => { if (event.target.name === "preset") { const preset = Presets[event.target.value]; document.querySelector("#disk-count").value = String(preset.diskCount); document.querySelector("#time-limit").value = String(preset.timeLimitMinutes); } updatePreview(); });
document.querySelector("#reset-config").addEventListener("click", applyDefaults);
form.addEventListener("submit", (event) => { event.preventDefault(); const config = readConfig(); const messages = validateConfig(config); errors.textContent = messages.join(" "); if (messages.length === 0) startExperiment(config); });
document.querySelector("#download-csv").addEventListener("click", downloadCsv); document.querySelector("#retry-same").addEventListener("click", () => startExperiment(lastConfig)); document.querySelector("#change-settings").addEventListener("click", () => { resultsSection.hidden = true; setupSections.forEach((section) => { section.hidden = false; }); document.querySelector("#setup").scrollIntoView({ behavior: "smooth" }); });
window.addEventListener("beforeunload", (event) => { if (!experimentRunning) return; event.preventDefault(); event.returnValue = ""; });
updatePreview();
