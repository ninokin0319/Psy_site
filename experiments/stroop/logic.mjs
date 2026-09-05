export const COLOR_OPTIONS = Object.freeze([
  { id: "red", label: "あか", css: "#c43f3a", key: "1" },
  { id: "blue", label: "あお", css: "#2563a8", key: "2" },
  { id: "yellow", label: "きいろ", css: "#b58b00", key: "3" },
  { id: "green", label: "みどり", css: "#287a48", key: "4" },
  { id: "black", label: "くろ", css: "#17221d", key: "5" },
]);

export const STROOP_CSV_COLUMNS = Object.freeze([
  "experiment_id",
  "experiment_version",
  "session_id",
  "random_seed",
  "recorded_at",
  "trial_index",
  "condition_trial_index",
  "condition",
  "stimulus_text",
  "ink_color",
  "correct_key",
  "response_key",
  "correctness",
  "rt",
  "timed_out",
  "block_order",
  "trials_per_condition",
  "response_deadline",
  "iti",
  "focus_loss_count",
  "browser",
  "os",
  "viewport_width",
  "viewport_height",
]);

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function balancedColors(count, random) {
  const sequence = [];
  while (sequence.length < count) {
    let cycle = shuffle(COLOR_OPTIONS, random);
    if (sequence.length > 0 && cycle[0].id === sequence.at(-1).id) {
      cycle = [...cycle.slice(1), cycle[0]];
    }
    sequence.push(...cycle);
  }
  return sequence.slice(0, count);
}

function buildConditionTrials(condition, count, random) {
  const inkColors = balancedColors(count, random);
  return inkColors.map((ink, index) => {
    const word = condition === "control"
      ? { id: "neutral", label: "XXXXX" }
      : shuffle(COLOR_OPTIONS.filter((color) => color.id !== ink.id), random)[0];
    return {
      condition,
      conditionTrialIndex: index + 1,
      stimulusText: word.label,
      wordColor: word.id,
      inkColor: ink.id,
      inkCss: ink.css,
      correctKey: ink.key,
    };
  });
}

export function buildStroopTrials({ trialsPerCondition, blockOrder, random = Math.random }) {
  const control = buildConditionTrials("control", trialsPerCondition, random);
  const incongruent = buildConditionTrials("incongruent", trialsPerCondition, random);
  let trials;
  if (blockOrder === "incongruent-first") trials = [...incongruent, ...control];
  else if (blockOrder === "mixed") trials = shuffle([...control, ...incongruent], random);
  else trials = [...control, ...incongruent];
  return trials.map((trial, index) => ({ ...trial, trialIndex: index + 1 }));
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeStroop(rows) {
  const conditions = ["control", "incongruent"].map((condition) => {
    const conditionRows = rows.filter((row) => row.condition === condition);
    const correctRows = conditionRows.filter((row) => Number(row.correctness) === 1);
    return {
      condition,
      count: conditionRows.length,
      correct: correctRows.length,
      accuracy: conditionRows.length === 0 ? null : correctRows.length / conditionRows.length,
      meanCorrectRt: mean(correctRows.map((row) => Number(row.rt)).filter(Number.isFinite)),
    };
  });
  const control = conditions.find((item) => item.condition === "control");
  const incongruent = conditions.find((item) => item.condition === "incongruent");
  const interferenceMs = control.meanCorrectRt === null || incongruent.meanCorrectRt === null
    ? null
    : incongruent.meanCorrectRt - control.meanCorrectRt;
  return { conditions, interferenceMs };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createStroopCsv(rows) {
  const header = STROOP_CSV_COLUMNS.map(quoteCsv).join(",");
  const lines = rows.map((row) => STROOP_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  const time = Date.now().toString(36);
  const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${time}-${suffix}`;
}
