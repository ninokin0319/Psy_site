export const GO_NO_GO_CSV_COLUMNS = Object.freeze([
  "experiment_id",
  "experiment_version",
  "session_id",
  "recorded_at",
  "trial_index",
  "condition_trial_index",
  "condition",
  "stimulus_shape",
  "go_shape",
  "response_key",
  "response_made",
  "correctness",
  "rt",
  "go_percent",
  "total_trials",
  "stimulus_duration",
  "response_deadline",
  "iti",
  "preset",
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

export function buildGoNoGoTrials({ totalTrials, goPercent, goShape = "circle", random = Math.random }) {
  const goCount = Math.round(totalTrials * goPercent / 100);
  const noGoCount = totalTrials - goCount;
  const noGoShape = goShape === "circle" ? "square" : "circle";
  const trials = [
    ...Array.from({ length: goCount }, () => ({ condition: "go", stimulusShape: goShape })),
    ...Array.from({ length: noGoCount }, () => ({ condition: "no-go", stimulusShape: noGoShape })),
  ];
  const conditionCounts = { go: 0, "no-go": 0 };
  return shuffle(trials, random).map((trial, index) => {
    conditionCounts[trial.condition] += 1;
    return {
      ...trial,
      trialIndex: index + 1,
      conditionTrialIndex: conditionCounts[trial.condition],
      goShape,
    };
  });
}

export function scoreGoNoGo(condition, responseMade) {
  if (condition === "go") return responseMade ? "hit" : "omission";
  return responseMade ? "commission" : "correct-rejection";
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeGoNoGo(rows) {
  const goRows = rows.filter((row) => row.condition === "go");
  const noGoRows = rows.filter((row) => row.condition === "no-go");
  const hits = goRows.filter((row) => Number(row.response_made) === 1);
  const omissions = goRows.length - hits.length;
  const commissions = noGoRows.filter((row) => Number(row.response_made) === 1).length;
  const correctRejections = noGoRows.length - commissions;
  return {
    total: rows.length,
    goCount: goRows.length,
    noGoCount: noGoRows.length,
    hits: hits.length,
    omissions,
    commissions,
    correctRejections,
    hitRate: rate(hits.length, goRows.length),
    omissionRate: rate(omissions, goRows.length),
    commissionRate: rate(commissions, noGoRows.length),
    correctRejectionRate: rate(correctRejections, noGoRows.length),
    meanCorrectGoRt: mean(hits.map((row) => Number(row.rt)).filter(Number.isFinite)),
  };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createGoNoGoCsv(rows) {
  const header = GO_NO_GO_CSV_COLUMNS.map(quoteCsv).join(",");
  const lines = rows.map((row) => GO_NO_GO_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  const time = Date.now().toString(36);
  const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${time}-${suffix}`;
}
