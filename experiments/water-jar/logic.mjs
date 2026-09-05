export const CLASSIC_WATER_JAR_PROBLEMS = Object.freeze([
  { id: 1, phase: "set", a: 21, b: 127, c: 3, target: 100, shortcut: null },
  { id: 2, phase: "set", a: 14, b: 163, c: 25, target: 99, shortcut: null },
  { id: 3, phase: "set", a: 18, b: 43, c: 10, target: 5, shortcut: null },
  { id: 4, phase: "set", a: 9, b: 42, c: 6, target: 21, shortcut: null },
  { id: 5, phase: "set", a: 20, b: 59, c: 4, target: 31, shortcut: null },
  { id: 6, phase: "critical", a: 23, b: 49, c: 3, target: 20, shortcut: "A-C" },
  { id: 7, phase: "critical", a: 15, b: 39, c: 3, target: 18, shortcut: "A+C" },
  { id: 8, phase: "extinction", a: 28, b: 76, c: 3, target: 25, shortcut: "A-C" },
  { id: 9, phase: "post-extinction", a: 18, b: 48, c: 4, target: 22, shortcut: "A+C" },
  { id: 10, phase: "post-extinction", a: 14, b: 36, c: 8, target: 6, shortcut: "A-C" },
]);

export const WATER_JAR_CSV_COLUMNS = Object.freeze([
  "experiment_id", "experiment_version", "session_id", "recorded_at", "attempt_index", "problem_order", "problem_id", "phase", "jar_a", "jar_b", "jar_c", "target", "formula_raw", "formula_normalized", "calculated_amount", "correctness", "solution_category", "problem_rt", "cumulative_rt", "sequence", "show_phase", "show_feedback", "require_correct", "completed", "solved_count", "set_formula_count_on_dual", "shortcut_count_on_dual", "time_limit_minutes", "browser", "os", "viewport_width", "viewport_height",
]);

export function normalizeFormula(value) {
  return String(value ?? "")
    .trim().toUpperCase()
    .replaceAll("Ａ", "A").replaceAll("Ｂ", "B").replaceAll("Ｃ", "C")
    .replaceAll("＋", "+").replaceAll("−", "-").replaceAll("－", "-").replaceAll("―", "-")
    .replace(/\s+/g, "");
}

export function parseFormula(value) {
  const normalized = normalizeFormula(value);
  if (!normalized || !/^[ABC](?:[+-][ABC])*$/.test(normalized)) {
    return { valid: false, normalized, coefficients: null };
  }
  const coefficients = { A: 0, B: 0, C: 0 };
  const tokenPattern = /(^|[+-])([ABC])/g;
  let match;
  while ((match = tokenPattern.exec(normalized)) !== null) {
    const sign = match[1] === "-" ? -1 : 1;
    coefficients[match[2]] += sign;
  }
  return { valid: true, normalized, coefficients };
}

export function evaluateFormula(value, problem) {
  const parsed = parseFormula(value);
  if (!parsed.valid) return { ...parsed, amount: null, correctness: false, category: "invalid" };
  const amount = parsed.coefficients.A * problem.a + parsed.coefficients.B * problem.b + parsed.coefficients.C * problem.c;
  const correctness = amount === problem.target;
  return { ...parsed, amount, correctness, category: correctness ? classifySolution(parsed.coefficients, problem) : "incorrect" };
}

function sameCoefficients(left, right) {
  return left.A === right.A && left.B === right.B && left.C === right.C;
}

export function classifySolution(coefficients, problem) {
  if (sameCoefficients(coefficients, { A: -1, B: 1, C: -2 })) return "set-formula";
  if (problem.shortcut) {
    const shortcut = parseFormula(problem.shortcut);
    if (shortcut.valid && sameCoefficients(coefficients, shortcut.coefficients)) return "shortcut";
  }
  return "other-valid";
}

export function buildWaterJarSequence(sequence = "classic") {
  if (sequence === "control") {
    return CLASSIC_WATER_JAR_PROBLEMS.filter((problem) => problem.id >= 6).map((problem) => ({ ...problem }));
  }
  if (sequence === "demo") {
    const selectedIds = new Set([1, 2, 3, 6, 7, 8, 9]);
    return CLASSIC_WATER_JAR_PROBLEMS.filter((problem) => selectedIds.has(problem.id));
  }
  return CLASSIC_WATER_JAR_PROBLEMS.map((problem) => ({ ...problem }));
}

export function summarizeWaterJar(attempts, problems, completed) {
  const correctAttempts = [];
  for (const problem of problems) {
    const correct = attempts.find((attempt) => attempt.problemId === problem.id && attempt.correctness === 1);
    if (correct) correctAttempts.push(correct);
  }
  const dualIds = new Set(problems.filter((problem) => problem.phase === "critical").map((problem) => problem.id));
  const dualSolutions = correctAttempts.filter((attempt) => dualIds.has(attempt.problemId));
  return {
    completed,
    problemCount: problems.length,
    solvedCount: correctAttempts.length,
    setFormulaCountOnDual: dualSolutions.filter((attempt) => attempt.solutionCategory === "set-formula").length,
    shortcutCountOnDual: dualSolutions.filter((attempt) => attempt.solutionCategory === "shortcut").length,
    otherCountOnDual: dualSolutions.filter((attempt) => attempt.solutionCategory === "other-valid").length,
    dualProblemCount: dualSolutions.length,
    extinctionSolved: correctAttempts.some((attempt) => problems.some((problem) => problem.id === attempt.problemId && problem.phase === "extinction")),
  };
}

function quoteCsv(value) { const text = value === undefined || value === null ? "" : String(value); return `"${text.replaceAll('"', '""')}"`; }
export function createWaterJarCsv(rows) { const header = WATER_JAR_CSV_COLUMNS.map(quoteCsv).join(","); const lines = rows.map((row) => WATER_JAR_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(",")); return `\ufeff${[header, ...lines].join("\r\n")}\r\n`; }
export function createSessionId(random = Math.random) { const time = Date.now().toString(36); const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0"); return `${time}-${suffix}`; }
