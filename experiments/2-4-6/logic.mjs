export const TWO_FOUR_SIX_CSV_COLUMNS = Object.freeze([
  "experiment_id", "experiment_version", "session_id", "recorded_at", "test_index",
  "number_1", "number_2", "number_3", "predicted_conforms", "conforms", "prediction_correct", "test_rt", "initial_hypothesis",
  "final_hypothesis", "self_evaluation", "total_tests", "conforming_tests",
  "nonconforming_tests", "max_tests", "prior_familiarity", "task_rt", "browser", "os", "viewport_width",
  "viewport_height",
]);

export function evaluateTriple(values) {
  const numbers = values.map(Number);
  if (numbers.length !== 3 || numbers.some((value) => !Number.isFinite(value))) {
    throw new TypeError("3つの有限な数値が必要です。");
  }
  return numbers[0] < numbers[1] && numbers[1] < numbers[2];
}

export function summarizeTests(tests) {
  const conforming = tests.filter((test) => Boolean(test.conforms)).length;
  return {
    total: tests.length,
    conforming,
    nonconforming: tests.length - conforming,
    conformingRate: tests.length === 0 ? null : conforming / tests.length,
  };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createTwoFourSixCsv(rows) {
  const header = TWO_FOUR_SIX_CSV_COLUMNS.map(quoteCsv).join(",");
  const body = rows.map((row) => TWO_FOUR_SIX_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  return `${Date.now().toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}
